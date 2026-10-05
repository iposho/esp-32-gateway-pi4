import { getServiceClient } from '@/lib/supabase/server'
import { BIRD_VISIT_GAP_MS, getBirdfeederDeviceId, getBirdfeederTimeZone } from '@/lib/birdfeeder'
import { normalizeSpecies } from '@/lib/bird-species'

/**
 * Статистика кормушки по подтверждённым нейронкой птицам (bird_detections.is_bird).
 * Визит — серия снимков с птицами без пауз дольше BIRD_VISIT_GAP_MS (как в статусе),
 * вид визита — самый уверенный ответ модели среди его снимков.
 * Визиты собирает функция БД bird_visits (scripts/016): в admin приходит строка
 * на визит, а не все снимки. Без неё — старый путь: все снимки и группировка здесь.
 * Виды сводятся к единому названию по латыни (lib/bird-species.ts).
 */

const STATS_TTL_MS = 5 * 60_000
const DB_TIMEOUT_MS = 8_000
const PAGE_SIZE = 1000
/** Окно графиков и «за 30 дней» */
export const STATS_DAYS = 30

type Row = {
  shot_at: string
  bird_count: number
  species: string | null
  species_latin: string | null
  confidence: number | null
}

export type Visit = {
  at: number
  species: string | null
  latin: string | null
  confidence: number
  maxCount: number
}

export type BirdStats = {
  timeZone: string
  days: number
  /** Визитов за всё время и за последние `days` дней */
  totalVisits: number
  recentVisits: number
  firstVisitAt: string | null
  /** Виды за всё время, чаще — выше */
  species: Array<{
    species: string
    latin: string | null
    visits: number
    recentVisits: number
    firstSeenAt: string
    lastSeenAt: string
  }>
  /** Визиты за `days` дней по часу начала (местное время), 24 значения */
  byHour: number[]
  /** Визиты по дням за `days` дней, от старых к новым, дни без птиц — 0 */
  byDay: Array<{ date: string; visits: number }>
  records: {
    busiestDay: { date: string; visits: number } | null
    /** Самый ранний и поздний визит по времени суток */
    earliest: { at: string; species: string | null } | null
    latest: { at: string; species: string | null } | null
    /** Больше всего птиц на одном снимке */
    mostBirds: { at: string; count: number; species: string | null } | null
  }
}

function iso(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

function localParts(ms: number, timeZone: string): { date: string; hour: number; minuteOfDay: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(new Date(ms))
      .map((p) => [p.type, p.value]),
  )
  const hour = Number(parts.hour)
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour, minuteOfDay: hour * 60 + Number(parts.minute) }
}

type VisitRow = {
  started_at: string
  species: string | null
  species_latin: string | null
  confidence: number | null
  max_count: number
}

/** null — функции bird_visits нет (scripts/016 не применён) */
async function loadVisitsSql(): Promise<Visit[] | null> {
  const supabase = getServiceClient()
  const deviceId = getBirdfeederDeviceId()
  const visits: Visit[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .rpc('bird_visits', { p_device_id: deviceId, p_gap_seconds: BIRD_VISIT_GAP_MS / 1000 })
      .range(from, from + PAGE_SIZE - 1)
      .abortSignal(AbortSignal.timeout(DB_TIMEOUT_MS))
    if (error) {
      if (error.code === 'PGRST202' || /bird_visits/.test(error.message)) {
        if (!sqlMissingLogged) {
          sqlMissingLogged = true
          console.warn('[Birdfeeder] no bird_visits() — apply scripts/016_bird_visits.sql; stats load all rows')
        }
        return null
      }
      throw new Error(error.message)
    }
    for (const r of (data ?? []) as VisitRow[]) {
      visits.push({
        at: Date.parse(r.started_at),
        species: r.species,
        latin: r.species_latin,
        confidence: r.species ? (r.confidence ?? 0) : -1,
        maxCount: r.max_count,
      })
    }
    if (!data || data.length < PAGE_SIZE) return visits
  }
}

let sqlMissingLogged = false

async function loadRows(): Promise<Row[]> {
  const supabase = getServiceClient()
  const deviceId = getBirdfeederDeviceId()
  const rows: Row[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('bird_detections')
      .select('shot_at, bird_count, species, species_latin, confidence')
      .eq('device_id', deviceId)
      .eq('is_bird', true)
      .order('shot_at', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
      .abortSignal(AbortSignal.timeout(DB_TIMEOUT_MS))
    if (error) throw new Error(error.message)
    rows.push(...((data ?? []) as Row[]))
    if (!data || data.length < PAGE_SIZE) return rows
  }
}

function groupVisits(rows: Row[]): Visit[] {
  const visits: Visit[] = []
  let prevAt = -Infinity
  for (const r of rows) {
    const at = Date.parse(r.shot_at)
    const conf = r.species ? (r.confidence ?? 0) : -1
    const current = visits[visits.length - 1]
    if (!current || at - prevAt > BIRD_VISIT_GAP_MS) {
      visits.push({ at, species: r.species, latin: r.species_latin, confidence: conf, maxCount: r.bird_count })
    } else {
      if (conf > current.confidence) {
        current.species = r.species
        current.latin = r.species_latin
        current.confidence = conf
      }
      current.maxCount = Math.max(current.maxCount, r.bird_count)
    }
    prevAt = at
  }
  return visits
}

/** Визиты по времени начала, старые первыми */
async function loadVisits(): Promise<Visit[]> {
  const fromSql = await loadVisitsSql()
  if (fromSql) return fromSql
  const rows = await loadRows()
  // Группировка в визиты требует порядка по времени
  return groupVisits([...rows].sort((a, b) => Date.parse(a.shot_at) - Date.parse(b.shot_at)))
}

export function computeBirdStats(visits: Visit[], now = Date.now(), timeZone = getBirdfeederTimeZone()): BirdStats {
  const today = localParts(now, timeZone).date
  // Даты последних STATS_DAYS дней в местном часовом поясе (сдвиг на сутки с запасом на переход времени)
  const dates: string[] = []
  for (let i = STATS_DAYS - 1; i >= 0; i--) {
    const date = localParts(now - i * 86_400_000, timeZone).date
    if (!dates.includes(date)) dates.push(date)
  }
  if (dates[dates.length - 1] !== today) dates.push(today)
  const recentSince = dates[0]

  const byHour = Array.from({ length: 24 }, () => 0)
  const byDayMap = new Map(dates.map((d) => [d, 0]))
  const allByDay = new Map<string, number>()
  const species = new Map<string, BirdStats['species'][number]>()
  let recentVisits = 0
  let earliest: { v: Visit; m: number } | null = null
  let latest: { v: Visit; m: number } | null = null
  let mostBirds: Visit | null = null

  for (const v of visits) {
    const { date, hour, minuteOfDay } = localParts(v.at, timeZone)
    const recent = date >= recentSince
    allByDay.set(date, (allByDay.get(date) ?? 0) + 1)
    if (recent) {
      recentVisits++
      byHour[hour]++
      if (byDayMap.has(date)) byDayMap.set(date, (byDayMap.get(date) ?? 0) + 1)
    }
    if (!earliest || minuteOfDay < earliest.m) earliest = { v, m: minuteOfDay }
    if (!latest || minuteOfDay > latest.m) latest = { v, m: minuteOfDay }
    if (!mostBirds || v.maxCount > mostBirds.maxCount) mostBirds = v

    const name = normalizeSpecies(v.species, v.latin)
    if (name.key && name.species) {
      const entry = species.get(name.key) ?? {
        species: name.species,
        latin: name.latin,
        visits: 0,
        recentVisits: 0,
        firstSeenAt: iso(v.at),
        lastSeenAt: iso(v.at),
      }
      entry.visits++
      if (recent) entry.recentVisits++
      entry.lastSeenAt = iso(v.at)
      if (!entry.latin && name.latin) entry.latin = name.latin
      species.set(name.key, entry)
    }
  }

  let busiestDay: BirdStats['records']['busiestDay'] = null
  for (const [date, count] of allByDay) {
    if (!busiestDay || count > busiestDay.visits) busiestDay = { date, visits: count }
  }

  return {
    timeZone,
    days: STATS_DAYS,
    totalVisits: visits.length,
    recentVisits,
    firstVisitAt: visits[0] ? iso(visits[0].at) : null,
    species: [...species.values()].sort((a, b) => b.visits - a.visits || b.recentVisits - a.recentVisits),
    byHour,
    byDay: [...byDayMap].map(([date, count]) => ({ date, visits: count })),
    records: {
      busiestDay,
      earliest: earliest ? { at: iso(earliest.v.at), species: speciesName(earliest.v) } : null,
      latest: latest ? { at: iso(latest.v.at), species: speciesName(latest.v) } : null,
      mostBirds: mostBirds && mostBirds.maxCount > 1
        ? { at: iso(mostBirds.at), count: mostBirds.maxCount, species: speciesName(mostBirds) }
        : null,
    },
  }
}

function speciesName(v: Visit): string | null {
  return normalizeSpecies(v.species, v.latin).species
}

let entry: { at: number; value: BirdStats } | null = null
let inflight: Promise<BirdStats> | null = null

/** Статистика кэшируется на 5 минут: она меняется только с новыми визитами */
export function getBirdStats(): Promise<BirdStats> {
  if (entry && Date.now() - entry.at < STATS_TTL_MS) return Promise.resolve(entry.value)
  if (inflight) return inflight
  inflight = loadVisits()
    .then((visits) => {
      const value = computeBirdStats(visits)
      entry = { at: Date.now(), value }
      return value
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}
