import { getServiceClient } from '@/lib/supabase/server'
import { isDeviceActive } from '@/lib/types'
import { isBirdAiEnabled } from '@/lib/bird-ai'

/**
 * Кормушка: камера (esp32-bird-cam) сама делает кадр раз в секунду, ищет движение
 * и хранит снимки с движением на SD. Шлюз кэширует ответы камеры, чтобы любое
 * число зрителей сайта давало не больше одного запроса к ESP32 в секунду.
 *
 * С AI_GATEWAY_API_KEY снимки проверяет нейронка (lib/bird-classifier.ts):
 * визиты, последний снимок и лента считаются только по подтверждённым птицам.
 */

/** Устройство-камера у кормушки */
export function getBirdfeederDeviceId(): string {
  return process.env.BIRDFEEDER_DEVICE_ID || 'esp32-bird-cam'
}

const STATE_TTL_MS = 5_000
const FRAME_TTL_MS = 1_000
const BIRD_PHOTO_TTL_MS = 10 * 60_000
const BIRD_PHOTO_CACHE_SIZE = 24
const BIRD_SHOTS_TTL_MS = 10_000
const DB_TIMEOUT_MS = 2_000
const CAMERA_TIMEOUT_MS = 5_000
/** Сколько последних строк телеметрии смотреть: OTA/fs-события идут без полей камеры */
const TELEMETRY_LOOKBACK = 5
/** Как BIRD_VISIT_GAP_MS в прошивке: тишина дольше — следующий визит новый */
const BIRD_VISIT_GAP_MS = 60_000
const DEFAULT_TZ = 'Asia/Yerevan'

export type BirdfeederStatus = {
  online: boolean
  daylight: boolean
  motion: boolean
  /** Последний визит птицы (ISO); без нейронки — последнее движение */
  birdLastAt: string | null
  visitsToday: number
  /** id последнего снимка с птицей на SD камеры */
  birdPhotoId: number | null
  updatedAt: string | null
  /** Снимки проверяет нейронка; false — всё выше считает детектор движения камеры */
  ai: boolean
  /** Визиты по детектору движения камеры, включая ложные */
  motionVisitsToday: number
  /** Вид птицы на последнем подтверждённом снимке */
  species: string | null
  /** Виды за сегодня: сколько визитов, чаще — выше */
  speciesToday: Array<{ species: string; latin: string | null; visits: number }>
}

type CameraState = {
  status: BirdfeederStatus
  /** http://<ip> камеры в локальной сети; null — IP неизвестен */
  baseUrl: string | null
  /** bird_photo_id из телеметрии: последний снимок по движению */
  motionPhotoId: number | null
}

type DetectionRow = {
  photo_id: number
  shot_at: string
  is_bird: boolean | null
  bird_count: number
  species: string | null
  species_latin: string | null
  confidence: number | null
}

const DETECTION_COLUMNS = 'photo_id, shot_at, is_bird, bird_count, species, species_latin, confidence'

/** Снимок на SD однозначно задаётся парой id + время: id идут по кольцу */
export function shotKey(photoId: number, at: string): string {
  return `${photoId}@${Date.parse(at)}`
}

/** Начало текущих суток в часовом поясе кормушки (BIRDFEEDER_TZ) */
export function startOfLocalDay(now = new Date()): Date {
  const timeZone = process.env.BIRDFEEDER_TZ || DEFAULT_TZ
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    })
      .formatToParts(now)
      .map((p) => [p.type, Number(p.value)]),
  ) as Record<string, number>
  const localAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  const offsetMs = localAsUtc - Math.floor(now.getTime() / 1000) * 1000
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day) - offsetMs)
}

export type CameraImage = {
  body: ArrayBuffer
  at: number
}

function cached<T>(ttlMs: number, load: () => Promise<T>): () => Promise<T> {
  let entry: { at: number; value: T } | null = null
  let inflight: Promise<T> | null = null

  return () => {
    if (entry && Date.now() - entry.at < ttlMs) return Promise.resolve(entry.value)
    if (inflight) return inflight
    inflight = load()
      .then((value) => {
        entry = { at: Date.now(), value }
        return value
      })
      .finally(() => {
        inflight = null
      })
    return inflight
  }
}

function epochToIso(raw: unknown): string | null {
  if (typeof raw !== 'number' || raw <= 0) return null
  return new Date(raw * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

function baseUrlFromPhotoUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw) return null
  try {
    return new URL(raw).origin
  } catch {
    return null
  }
}

async function loadState(): Promise<CameraState> {
  const supabase = getServiceClient()
  const deviceId = getBirdfeederDeviceId()
  const signal = AbortSignal.timeout(DB_TIMEOUT_MS)

  const [deviceRes, telemetryRes] = await Promise.all([
    supabase
      .from('devices')
      .select('last_seen')
      .eq('device_id', deviceId)
      .abortSignal(signal)
      .maybeSingle(),
    supabase
      .from('telemetry')
      .select('created_at, payload')
      .eq('device_id', deviceId)
      .order('created_at', { ascending: false })
      .limit(TELEMETRY_LOOKBACK)
      .abortSignal(signal),
  ])

  const err = deviceRes.error ?? telemetryRes.error
  if (err) throw new Error(err.message)

  const rows = (telemetryRes.data ?? []) as Array<{
    created_at: string
    payload: Record<string, unknown>
  }>
  const row = rows.find((r) => 'last_photo_url' in r.payload) ?? null
  const p = row?.payload ?? {}

  const lastSeen = (deviceRes.data?.last_seen as string | null) ?? null
  const online = isDeviceActive(lastSeen, rows[0]?.created_at ?? null)
  const motionVisitsToday = typeof p.bird_visits_today === 'number' ? p.bird_visits_today : 0
  const motionPhotoId = typeof p.bird_photo_id === 'number' ? p.bird_photo_id : null

  const status: BirdfeederStatus = {
    online,
    daylight: p.daylight !== false,
    motion: online && p.motion === true,
    birdLastAt: epochToIso(p.bird_last_at),
    visitsToday: motionVisitsToday,
    birdPhotoId: motionPhotoId,
    updatedAt: row?.created_at ?? null,
    ai: false,
    motionVisitsToday,
    species: null,
    speciesToday: [],
  }

  if (isBirdAiEnabled()) {
    try {
      Object.assign(status, await loadAiStatus())
    } catch (e) {
      // Нет таблицы (не применён 011) или БД тормозит — показываем детектор движения
      console.warn('[Birdfeeder] detections unavailable:', (e as Error).message)
    }
  }

  return { baseUrl: baseUrlFromPhotoUrl(p.last_photo_url), motionPhotoId, status }
}

async function loadAiStatus(): Promise<Partial<BirdfeederStatus>> {
  const supabase = getServiceClient()
  const deviceId = getBirdfeederDeviceId()
  const signal = AbortSignal.timeout(DB_TIMEOUT_MS)

  const [todayRes, lastRes] = await Promise.all([
    supabase
      .from('bird_detections')
      .select(DETECTION_COLUMNS)
      .eq('device_id', deviceId)
      .eq('is_bird', true)
      .gte('shot_at', startOfLocalDay().toISOString())
      .order('shot_at', { ascending: true })
      .abortSignal(signal),
    supabase
      .from('bird_detections')
      .select(DETECTION_COLUMNS)
      .eq('device_id', deviceId)
      .eq('is_bird', true)
      .order('shot_at', { ascending: false })
      .limit(1)
      .abortSignal(signal),
  ])
  const err = todayRes.error ?? lastRes.error
  if (err) throw new Error(err.message)

  // Визит — серия снимков с птицами без пауз дольше BIRD_VISIT_GAP_MS.
  // Вид визита — самый уверенный ответ модели среди его снимков.
  const visits: DetectionRow[] = []
  let prevAt = -Infinity
  for (const d of (todayRes.data ?? []) as DetectionRow[]) {
    const at = Date.parse(d.shot_at)
    const current = visits[visits.length - 1]
    if (at - prevAt > BIRD_VISIT_GAP_MS || !current) visits.push(d)
    else if (d.species && (d.confidence ?? 0) > (current.species ? (current.confidence ?? 0) : -1)) {
      visits[visits.length - 1] = d
    }
    prevAt = at
  }

  const bySpecies = new Map<string, { species: string; latin: string | null; visits: number }>()
  for (const v of visits) {
    if (!v.species) continue
    const entry = bySpecies.get(v.species) ?? { species: v.species, latin: v.species_latin, visits: 0 }
    entry.visits++
    bySpecies.set(v.species, entry)
  }

  const last = ((lastRes.data ?? []) as DetectionRow[])[0]
  return {
    ai: true,
    visitsToday: visits.length,
    birdLastAt: last ? new Date(last.shot_at).toISOString().replace(/\.\d{3}Z$/, 'Z') : null,
    birdPhotoId: last?.photo_id ?? null,
    species: last?.species ?? null,
    speciesToday: [...bySpecies.values()].sort((a, b) => b.visits - a.visits),
  }
}

export const getCameraState = cached(STATE_TTL_MS, loadState)

export class CameraUnavailableError extends Error {}

/**
 * Веб-сервер ESP32 обслуживает один запрос за раз: параллельные запросы
 * (лента из десятка снимков + живой кадр) копятся в его очереди и ловят таймаут.
 * Поэтому все запросы к камере идут строго по одному.
 */
let cameraQueue: Promise<unknown> = Promise.resolve()

function enqueueCamera<T>(task: () => Promise<T>): Promise<T> {
  const run = cameraQueue.then(task, task)
  cameraQueue = run.catch(() => undefined)
  return run
}

function fetchCamera(url: string, accept: string): Promise<Response> {
  return enqueueCamera(async () => {
    let res: Response
    try {
      res = await fetch(url, {
        cache: 'no-store',
        signal: AbortSignal.timeout(CAMERA_TIMEOUT_MS),
        headers: { Accept: accept },
      })
    } catch (e) {
      throw new CameraUnavailableError(`camera fetch failed: ${(e as Error).message}`)
    }
    if (!res.ok) throw new CameraUnavailableError(`camera responded ${res.status}`)
    // Тело читаем внутри очереди: пока оно не дочитано, камера занята
    return new Response(await res.arrayBuffer(), { headers: res.headers })
  })
}

async function fetchJpeg(url: string): Promise<ArrayBuffer> {
  return (await fetchCamera(url, 'image/jpeg')).arrayBuffer()
}

async function requireBaseUrl(): Promise<string> {
  const { baseUrl, status } = await getCameraState()
  if (!baseUrl || !status.online) throw new CameraUnavailableError('camera offline')
  return baseUrl
}

/** Живой кадр из RAM камеры, не чаще раза в секунду на всех зрителей */
export const getLiveFrame = cached(FRAME_TTL_MS, async (): Promise<CameraImage> => {
  const baseUrl = await requireBaseUrl()
  return { body: await fetchJpeg(`${baseUrl}/latest.jpg`), at: Date.now() }
})

const birdPhotos = new Map<number, { at: number; image: Promise<CameraImage> }>()

/**
 * Снимок с птицей с SD камеры. Файл по id не меняется, пока кольцо
 * из 4800 снимков не пойдёт на новый круг, — держим несколько штук в памяти.
 */
export function getBirdPhoto(id: number): Promise<CameraImage> {
  const hit = birdPhotos.get(id)
  if (hit && Date.now() - hit.at < BIRD_PHOTO_TTL_MS) return hit.image

  const image = requireBaseUrl().then(async (baseUrl) => ({
    body: await fetchJpeg(`${baseUrl}/photo?id=${id}`),
    at: Date.now(),
  }))
  birdPhotos.set(id, { at: Date.now(), image })
  image.catch(() => birdPhotos.delete(id))

  while (birdPhotos.size > BIRD_PHOTO_CACHE_SIZE) {
    const oldest = birdPhotos.keys().next().value
    if (oldest === undefined) break
    birdPhotos.delete(oldest)
  }
  return image
}

export type BirdShot = {
  /** id снимка на SD — для /api/camera/birdfeeder/bird?id= */
  id: number
  /** Время визита (ISO) */
  at: string
}

/** Последние снимки по движению, новые первыми (журнал камеры, до 24 штук) */
export const getBirdShots = cached(BIRD_SHOTS_TTL_MS, async (): Promise<BirdShot[]> => {
  const baseUrl = await requireBaseUrl()
  const raw = (await (await fetchCamera(`${baseUrl}/birds.json`, 'application/json')).json()) as {
    shots?: Array<{ id?: unknown; at?: unknown }>
  }
  const shots: BirdShot[] = []
  for (const shot of raw.shots ?? []) {
    const at = epochToIso(shot.at)
    if (typeof shot.id === 'number' && at) shots.push({ id: shot.id, at })
  }
  return shots
})

export type BirdShotDetails = BirdShot & {
  /** null — нейронка ещё не смотрела снимок (или выключена) */
  bird: boolean | null
  count: number | null
  species: string | null
  latin: string | null
  confidence: number | null
}

/**
 * Лента для сайта: снимки камеры с ответом нейронки.
 * Снимки, где нейронка птицу не нашла, из ленты убираются.
 */
export const getBirdShotsWithDetections = cached(
  BIRD_SHOTS_TTL_MS,
  async (): Promise<BirdShotDetails[]> => {
    const shots = await getBirdShots()
    const plain = (s: BirdShot): BirdShotDetails => ({
      ...s,
      bird: null,
      count: null,
      species: null,
      latin: null,
      confidence: null,
    })
    if (!isBirdAiEnabled() || shots.length === 0) return shots.map(plain)

    const { data, error } = await getServiceClient()
      .from('bird_detections')
      .select(DETECTION_COLUMNS)
      .eq('device_id', getBirdfeederDeviceId())
      .gte('shot_at', shots[shots.length - 1].at)
      .abortSignal(AbortSignal.timeout(DB_TIMEOUT_MS))
    if (error) {
      console.warn('[Birdfeeder] detections unavailable:', error.message)
      return shots.map(plain)
    }

    const byKey = new Map(((data ?? []) as DetectionRow[]).map((d) => [shotKey(d.photo_id, d.shot_at), d]))
    const result: BirdShotDetails[] = []
    for (const shot of shots) {
      const d = byKey.get(shotKey(shot.id, shot.at))
      if (d?.is_bird === false) continue
      result.push(
        d && d.is_bird
          ? {
              ...shot,
              bird: true,
              count: d.bird_count,
              species: d.species,
              latin: d.species_latin,
              confidence: d.confidence,
            }
          : plain(shot),
      )
    }
    return result
  },
)
