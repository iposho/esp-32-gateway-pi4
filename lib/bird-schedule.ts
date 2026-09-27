import { getServiceClient } from '@/lib/supabase/server'
import { startOfLocalDay } from '@/lib/birdfeeder'
import { sunElevation } from '@/lib/sun'
import {
  type BirdSchedule,
  DEFAULT_SCHEDULE,
  hhmmToMinutes,
  parseSchedule,
} from '@/lib/bird-schedule-shared'

/**
 * Часы работы распознавания: вне окна снимки не забираются с камеры и не
 * уходят в модель (filter:night). Расписание — в bird_ai_settings (scripts/014),
 * редактируется в дашборде. Восход и закат — sunrise-sunset.org, а если API
 * недоступен — свой расчёт по формулам NOAA (lib/sun.ts).
 */

const DEFAULT_TZ = 'Asia/Yerevan'
const DEFAULT_CITY = 'Ереван'
const DEFAULT_LAT = 40.1792
const DEFAULT_LON = 44.4991
const SCHEDULE_TTL_MS = 30_000
const SUN_API = 'https://api.sunrise-sunset.org/json'
const SUN_API_TIMEOUT_MS = 5_000
/** Не удалось спросить API — считаем сами и пробуем API снова через час */
const SUN_CALC_TTL_MS = 60 * 60_000
const SUN_CACHE_DAYS = 7

export type SunTimes = {
  /** Начало утренних и конец вечерних гражданских сумерек, восход и закат (ISO) */
  dawn: string
  sunrise: string
  sunset: string
  dusk: string
  source: 'sunrise-sunset.org' | 'calc'
}

export type ScheduleWindow = {
  /** Местная дата YYYY-MM-DD */
  date: string
  /** null — круглосуточно */
  startMin: number | null
  endMin: number | null
  sun: SunTimes | null
}

type Store = {
  schedule: { at: number; value: { schedule: BirdSchedule; stored: boolean; error?: string } } | null
  sun: Map<string, { at: number; value: SunTimes }>
}

// globalThis: цикл классификатора и роуты дашборда — разные копии модуля,
// а сброс кэша после сохранения должен быть виден обоим
const store = ((globalThis as unknown as { __birdSchedule?: Store }).__birdSchedule ??= {
  schedule: null,
  sun: new Map(),
})

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name]
  const n = raw === undefined || raw === '' ? NaN : Number(raw)
  return Number.isFinite(n) ? n : fallback
}

export function getLocation() {
  return {
    city: process.env.BIRDFEEDER_CITY || DEFAULT_CITY,
    lat: envNumber('BIRDFEEDER_LAT', DEFAULT_LAT),
    lon: envNumber('BIRDFEEDER_LON', DEFAULT_LON),
    tz: process.env.BIRDFEEDER_TZ || DEFAULT_TZ,
  }
}

/** Местные дата и минуты от полуночи */
export function localParts(date: Date, tz = getLocation().tz): { date: string; minutes: number } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(date)
      .map((x) => [x.type, x.value]),
  )
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) }
}

export async function getSchedule(): Promise<{ schedule: BirdSchedule; stored: boolean; error?: string }> {
  // Старый выключатель из .env важнее дашборда
  if (process.env.BIRD_AI_NIGHT_SKIP === '0') return { schedule: { mode: 'always' }, stored: false }

  const cached = store.schedule
  if (cached && Date.now() - cached.at < SCHEDULE_TTL_MS) return cached.value

  let value: { schedule: BirdSchedule; stored: boolean; error?: string }
  try {
    const { data, error } = await getServiceClient()
      .from('bird_ai_settings')
      .select('schedule')
      .eq('id', 1)
      .abortSignal(AbortSignal.timeout(2_000))
      .maybeSingle()
    if (error) throw new Error(error.message)
    const parsed = data ? parseSchedule(data.schedule) : null
    value = parsed ? { schedule: parsed, stored: true } : { schedule: DEFAULT_SCHEDULE, stored: false }
  } catch (e) {
    // Нет таблицы (не применён 014) — работаем по шаблону по умолчанию
    value = { schedule: DEFAULT_SCHEDULE, stored: false, error: (e as Error).message }
  }
  store.schedule = { at: Date.now(), value }
  return value
}

/** null — вернуть шаблон по умолчанию */
export async function saveSchedule(schedule: BirdSchedule | null): Promise<void> {
  const table = getServiceClient().from('bird_ai_settings')
  const { error } =
    schedule === null
      ? await table.delete().eq('id', 1)
      : await table.upsert({ id: 1, schedule, updated_at: new Date().toISOString() })
  if (error) throw new Error(error.message)
  store.schedule = null
}

async function fetchSunTimes(date: string): Promise<SunTimes> {
  const { lat, lon, tz } = getLocation()
  const url = `${SUN_API}?lat=${lat}&lng=${lon}&date=${date}&formatted=0&tzid=${encodeURIComponent(tz)}`
  const res = await fetch(url, { signal: AbortSignal.timeout(SUN_API_TIMEOUT_MS), cache: 'no-store' })
  if (!res.ok) throw new Error(`sunrise-sunset.org ${res.status}`)
  const body = (await res.json()) as {
    status?: string
    results?: Record<string, string>
  }
  const r = body.results
  if (body.status !== 'OK' || !r) throw new Error(`sunrise-sunset.org status ${body.status}`)
  const times = {
    dawn: r.civil_twilight_begin,
    sunrise: r.sunrise,
    sunset: r.sunset,
    dusk: r.civil_twilight_end,
  }
  for (const v of Object.values(times)) {
    if (!v || Number.isNaN(Date.parse(v))) throw new Error('sunrise-sunset.org: bad time')
  }
  return { ...times, source: 'sunrise-sunset.org' }
}

/**
 * Свой расчёт: первые пересечения высоты солнца −6° (сумерки) и −0,833°
 * (восход и закат с учётом рефракции, как у sunrise-sunset.org) за местные сутки
 */
function calcSunTimes(date: string): SunTimes {
  const { lat, lon } = getLocation()
  const dayStart = startOfLocalDay(new Date(`${date}T12:00:00Z`)).getTime()
  const find = (threshold: number, rising: boolean): string => {
    let prev = sunElevation(new Date(dayStart), lat, lon)
    for (let m = 1; m <= 1440; m++) {
      const t = dayStart + m * 60_000
      const e = sunElevation(new Date(t), lat, lon)
      if (rising ? prev < threshold && e >= threshold : prev >= threshold && e < threshold) {
        return new Date(t).toISOString()
      }
      prev = e
    }
    // Полярный день/ночь — для Еревана не случается
    return new Date(dayStart + (rising ? 0 : 1439) * 60_000).toISOString()
  }
  return {
    dawn: find(-6, true),
    sunrise: find(-0.833, true),
    sunset: find(-0.833, false),
    dusk: find(-6, false),
    source: 'calc',
  }
}

export async function getSunTimes(date: string): Promise<SunTimes> {
  const hit = store.sun.get(date)
  if (hit && (hit.value.source === 'sunrise-sunset.org' || Date.now() - hit.at < SUN_CALC_TTL_MS)) {
    return hit.value
  }
  let value: SunTimes
  try {
    value = await fetchSunTimes(date)
  } catch (e) {
    console.warn(`[BirdAI] sunrise-sunset.org unavailable, using own calc: ${(e as Error).message}`)
    value = calcSunTimes(date)
  }
  store.sun.set(date, { at: Date.now(), value })
  while (store.sun.size > SUN_CACHE_DAYS) {
    const oldest = store.sun.keys().next().value
    if (oldest === undefined) break
    store.sun.delete(oldest)
  }
  return value
}

export async function getWindow(date: string, schedule: BirdSchedule): Promise<ScheduleWindow> {
  if (schedule.mode === 'always') return { date, startMin: null, endMin: null, sun: null }
  if (schedule.mode === 'fixed') {
    return { date, startMin: hhmmToMinutes(schedule.start), endMin: hhmmToMinutes(schedule.end), sun: null }
  }
  const sun = await getSunTimes(date)
  const { tz } = getLocation()
  const [from, to] = schedule.edge === 'civil' ? [sun.dawn, sun.dusk] : [sun.sunrise, sun.sunset]
  return {
    date,
    startMin: localParts(new Date(from), tz).minutes + schedule.startOffsetMin,
    endMin: localParts(new Date(to), tz).minutes + schedule.endOffsetMin,
    sun,
  }
}

export function inWindow(minutes: number, w: ScheduleWindow): boolean {
  if (w.startMin === null || w.endMin === null) return true
  // Окно через полночь (fixed 22:00–06:00)
  if (w.startMin > w.endMin) return minutes >= w.startMin || minutes < w.endMin
  return minutes >= w.startMin && minutes < w.endMin
}

/** Снимок сделан вне часов работы — в модель его не отправляем */
export async function isAsleep(at: string): Promise<boolean> {
  const { schedule } = await getSchedule()
  if (schedule.mode === 'always') return false
  const local = localParts(new Date(at))
  return !inWindow(local.minutes, await getWindow(local.date, schedule))
}
