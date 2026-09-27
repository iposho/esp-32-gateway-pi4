import { getServiceClient } from '@/lib/supabase/server'
import {
  type BirdAiCostError,
  classifyBirdPhoto,
  getBirdAiMinLuma,
  getBirdAiModel,
  isBirdAiEnabled,
  photoLuma,
} from '@/lib/bird-ai'
import { isAsleep } from '@/lib/bird-schedule'
import {
  CameraUnavailableError,
  getBirdfeederDeviceId,
  getBirdPhoto,
  getBirdShots,
  getCameraState,
  shotKey,
  startOfLocalDay,
} from '@/lib/birdfeeder'

/**
 * Фоновый цикл в процессе admin: новые снимки кормушки (камера пишет их на SD
 * по детектору движения) уходят в модель, ответ — в bird_detections.
 * Статус и лента кормушки дальше считают только подтверждённых птиц.
 */

const POLL_MS = 15_000
/** Столько раз пробуем снимок, потом пишем строку с ошибкой и больше не трогаем */
const MAX_ATTEMPTS = 3
/** Пауза после отказа Gateway по ключу/кредитам/лимиту, чтобы не долбить его */
const AUTH_PAUSE_MS = 30 * 60_000
const RATE_PAUSE_MS = 60_000
const DEFAULT_DAILY_LIMIT = 300
/** model у строк, которые отсеял фильтр до модели: не вызов, в лимит не входит */
export const FILTER_MODEL_PREFIX = 'filter:'
/** Не больше стольких вызовов модели за проход: иначе при сбое модели каждый проход бьёт по всем 24 снимкам */
const MAX_CALLS_PER_TICK = 3

const attempts = new Map<string, number>()
/** Цена неудачных попыток снимка: войдёт в cost_usd его итоговой строки */
const failedCost = new Map<string, number>()
/*
 * Счётчики — в globalThis: цикл запускается из instrumentation, а /usage читает их
 * из бандла роута, где у модуля своя копия с вечно пустыми переменными.
 */
const counters = ((globalThis as unknown as { __birdAiCounters?: BirdAiCounters }).__birdAiCounters ??= {
  /** Вызовы модели за сутки, включая неудачные. Строк в БД для них может не быть */
  calls: { day: '', count: 0 },
  /** Расход этого процесса за сутки, USD (после рестарта — с нуля; точный — отчёт Gateway) */
  spent: { day: '', usd: 0 },
})

type BirdAiCounters = {
  calls: { day: string; count: number }
  spent: { day: string; usd: number }
}
let costColumnMissing = false

/** Для /usage: вызовы модели и расход с начала суток по счётчику процесса */
export function getBirdAiCallsToday(): { calls: number; spentUsd: number } {
  const day = startOfLocalDay().toISOString()
  return {
    calls: counters.calls.day === day ? counters.calls.count : 0,
    spentUsd: counters.spent.day === day ? counters.spent.usd : 0,
  }
}

function addSpent(day: string, usd: number | null | undefined): void {
  if (!usd) return
  if (counters.spent.day !== day) counters.spent = { day, usd: 0 }
  counters.spent.usd += usd
}
let pausedUntil = 0
/** bird_photo_id из телеметрии, для которого все снимки уже разобраны */
let doneMotionPhotoId: number | null | undefined
let limitLoggedDay = ''

export function dailyLimit(): number {
  const n = Number(process.env.BIRD_AI_DAILY_LIMIT)
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_DAILY_LIMIT
}

function errorStatus(e: unknown): number | undefined {
  // RetryError оборачивает последнюю ошибку
  const err = (e as { lastError?: unknown }).lastError ?? e
  const status = (err as { statusCode?: unknown }).statusCode
  return typeof status === 'number' ? status : undefined
}

async function tick(): Promise<void> {
  if (Date.now() < pausedUntil) return

  // Телеметрия идёт каждые 10 с и несёт id последнего снимка: пока он не
  // сменился, к камере за /birds.json не ходим.
  const { status, motionPhotoId } = await getCameraState()
  if (!status.online || motionPhotoId === null) return
  if (motionPhotoId === doneMotionPhotoId) return

  const shots = await getBirdShots()
  if (shots.length === 0) return

  const supabase = getServiceClient()
  const deviceId = getBirdfeederDeviceId()

  const { data: known, error: knownErr } = await supabase
    .from('bird_detections')
    .select('photo_id, shot_at')
    .eq('device_id', deviceId)
    .gte('shot_at', shots[shots.length - 1].at)
  if (knownErr) throw new Error(knownErr.message)

  const done = new Set((known ?? []).map((r) => shotKey(r.photo_id, r.shot_at)))
  // Новые первыми: они важнее для ленты, а старые при сбоях всё равно уйдут из журнала камеры
  const pending = shots.filter((s) => !done.has(shotKey(s.id, s.at)))
  if (pending.length === 0) {
    doneMotionPhotoId = motionPhotoId
    return
  }

  const day = startOfLocalDay().toISOString()
  const { calls } = counters
  if (calls.day !== day) {
    // После рестарта за сегодня известны только записанные строки
    const { count, error: countErr } = await supabase
      .from('bird_detections')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', day)
      .not('model', 'like', `${FILTER_MODEL_PREFIX}%`)
    if (countErr) throw new Error(countErr.message)
    calls.day = day
    calls.count = count ?? 0
  }

  const budget = Math.min(dailyLimit() - calls.count, MAX_CALLS_PER_TICK)
  if (budget <= 0) {
    if (calls.count < dailyLimit()) return
    if (limitLoggedDay !== day) {
      limitLoggedDay = day
      console.warn(`[BirdAI] daily limit ${dailyLimit()} reached, skipping until tomorrow`)
    }
    return
  }

  let failed = false
  for (const shot of pending.slice(0, budget)) {
    const key = shotKey(shot.id, shot.at)
    try {
      // Вне часов работы (расписание в дашборде): снимок даже не забираем с камеры
      if (await isAsleep(shot.at)) {
        await saveRow({
          photo_id: shot.id,
          shot_at: shot.at,
          is_bird: false,
          bird_count: 0,
          model: `${FILTER_MODEL_PREFIX}night`,
        })
        attempts.delete(key)
        console.log(`[BirdAI] photo ${shot.id}: skipped, outside schedule`)
        continue
      }

      const photo = await getBirdPhoto(shot.id)

      // Тёмный кадр (ночь, комната, объектив закрыт) — птицу там не разглядеть, вызов не нужен
      const luma = photoLuma(photo.body)
      if (luma !== null && luma < getBirdAiMinLuma()) {
        await saveRow({
          photo_id: shot.id,
          shot_at: shot.at,
          is_bird: false,
          bird_count: 0,
          model: `${FILTER_MODEL_PREFIX}dark`,
        })
        attempts.delete(key)
        console.log(`[BirdAI] photo ${shot.id}: skipped, dark (luma ${luma} < ${getBirdAiMinLuma()})`)
        continue
      }

      counters.calls.count++
      const startedAt = Date.now()
      const r = await classifyBirdPhoto(photo.body).catch((e: unknown) => {
        throw Object.assign(e as Error, { elapsedMs: Date.now() - startedAt })
      })
      addSpent(day, r.costUsd)
      const prevCost = failedCost.get(key) ?? 0
      failedCost.delete(key)
      await saveRow({
        photo_id: shot.id,
        shot_at: shot.at,
        is_bird: r.bird,
        bird_count: r.count,
        species: r.species,
        species_latin: r.latin,
        confidence: r.confidence,
        model: r.model,
        input_tokens: r.inputTokens,
        output_tokens: r.outputTokens,
        cost_usd: r.costUsd === null && prevCost === 0 ? null : (r.costUsd ?? 0) + prevCost,
      })
      attempts.delete(key)
      console.log(
        `[BirdAI] photo ${shot.id}: ${r.bird ? `bird ×${r.count} ${r.species ?? '?'} ${Math.round(r.confidence * 100)}%` : 'no bird'}` +
          ` (luma ${luma ?? '?'}, ${r.inputTokens ?? '?'}+${r.outputTokens ?? '?'} tok, ${formatUsd(r.costUsd)}, ${Date.now() - startedAt} ms)`,
      )
    } catch (e) {
      failed = true
      if (e instanceof CameraUnavailableError) return

      const cost = (e as BirdAiCostError).costUsd
      addSpent(day, cost)
      if (cost) failedCost.set(key, (failedCost.get(key) ?? 0) + cost)

      const status = errorStatus(e)
      const elapsed = (e as { elapsedMs?: number }).elapsedMs
      const message = (e as Error).message + (elapsed === undefined ? '' : ` [${elapsed} ms]`)
      if (status === 401 || status === 402 || status === 403) {
        pausedUntil = Date.now() + AUTH_PAUSE_MS
        console.error(`[BirdAI] gateway refused (${status}), pausing 30 min: ${message}`)
        return
      }
      if (status === 429) {
        pausedUntil = Date.now() + RATE_PAUSE_MS
        console.warn(`[BirdAI] rate limited, pausing 1 min`)
        return
      }

      const n = (attempts.get(key) ?? 0) + 1
      console.error(`[BirdAI] photo ${shot.id} failed (attempt ${n}/${MAX_ATTEMPTS}): ${message}`)
      if (n < MAX_ATTEMPTS) {
        attempts.set(key, n)
        continue
      }
      attempts.delete(key)
      const total = failedCost.get(key)
      failedCost.delete(key)
      await saveRow({
        photo_id: shot.id,
        shot_at: shot.at,
        is_bird: null,
        model: getBirdAiModel(),
        cost_usd: total ?? null,
        error: message.slice(0, 500),
      })
    }
  }

  if (!failed && pending.length <= budget) doneMotionPhotoId = motionPhotoId
}

function formatUsd(usd: number | null): string {
  return usd === null ? '$?' : `$${usd.toFixed(6)}`
}

async function saveRow(row: Record<string, unknown>): Promise<void> {
  const upsert = (r: Record<string, unknown>) =>
    getServiceClient()
      .from('bird_detections')
      .upsert(
        { device_id: getBirdfeederDeviceId(), ...r },
        { onConflict: 'device_id,photo_id,shot_at', ignoreDuplicates: true },
      )

  // Колонка cost_usd появляется в scripts/012; без неё пишем строку без цены
  const { cost_usd: _cost, ...withoutCost } = row
  let { error } = await upsert(costColumnMissing ? withoutCost : row)
  if (error && !costColumnMissing && error.message.includes('cost_usd')) {
    costColumnMissing = true
    console.warn('[BirdAI] no bird_detections.cost_usd — apply scripts/012_bird_detections_cost.sql')
    ;({ error } = await upsert(withoutCost))
  }
  if (error) throw new Error(`save detection: ${error.message}`)
}

const globalForBirdAi = globalThis as unknown as { __birdClassifier?: NodeJS.Timeout }

/** Запускается один раз на процесс из instrumentation.ts */
export function startBirdClassifier(): void {
  if (globalForBirdAi.__birdClassifier) return
  if (!isBirdAiEnabled()) {
    console.log('[BirdAI] disabled: no AI_GATEWAY_API_KEY')
    return
  }
  console.log(`[BirdAI] started, model ${getBirdAiModel()}, daily limit ${dailyLimit()}`)

  let running = false
  globalForBirdAi.__birdClassifier = setInterval(() => {
    if (running) return
    running = true
    tick()
      .catch((e) => {
        if (!(e instanceof CameraUnavailableError)) console.error('[BirdAI] tick failed:', e)
      })
      .finally(() => {
        running = false
      })
  }, POLL_MS)
}
