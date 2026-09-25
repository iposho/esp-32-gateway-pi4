import { getServiceClient } from '@/lib/supabase/server'
import { isDeviceActive } from '@/lib/types'

/**
 * Кормушка: камера (esp32-bird-cam) сама делает кадр раз в секунду, ищет движение
 * и хранит снимки с птицами на SD. Шлюз ничего не считает — только
 * кэширует ответы камеры, чтобы любое число зрителей сайта давало
 * не больше одного запроса к ESP32 в секунду.
 */

/** Устройство-камера у кормушки */
export function getBirdfeederDeviceId(): string {
  return process.env.BIRDFEEDER_DEVICE_ID || 'esp32-bird-cam'
}

const STATE_TTL_MS = 5_000
const FRAME_TTL_MS = 1_000
const BIRD_PHOTO_TTL_MS = 10 * 60_000
const BIRD_PHOTO_CACHE_SIZE = 8
const DB_TIMEOUT_MS = 2_000
const CAMERA_TIMEOUT_MS = 5_000
/** Сколько последних строк телеметрии смотреть: OTA/fs-события идут без полей камеры */
const TELEMETRY_LOOKBACK = 5

export type BirdfeederStatus = {
  online: boolean
  daylight: boolean
  motion: boolean
  /** Последнее движение у кормушки (ISO) */
  birdLastAt: string | null
  visitsToday: number
  /** id последнего снимка с птицей на SD камеры */
  birdPhotoId: number | null
  updatedAt: string | null
}

type CameraState = {
  status: BirdfeederStatus
  /** http://<ip> камеры в локальной сети; null — IP неизвестен */
  baseUrl: string | null
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

  return {
    baseUrl: baseUrlFromPhotoUrl(p.last_photo_url),
    status: {
      online,
      daylight: p.daylight !== false,
      motion: online && p.motion === true,
      birdLastAt: epochToIso(p.bird_last_at),
      visitsToday: typeof p.bird_visits_today === 'number' ? p.bird_visits_today : 0,
      birdPhotoId: typeof p.bird_photo_id === 'number' ? p.bird_photo_id : null,
      updatedAt: row?.created_at ?? null,
    },
  }
}

export const getCameraState = cached(STATE_TTL_MS, loadState)

export class CameraUnavailableError extends Error {}

async function fetchJpeg(url: string): Promise<ArrayBuffer> {
  let res: Response
  try {
    res = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(CAMERA_TIMEOUT_MS),
      headers: { Accept: 'image/jpeg' },
    })
  } catch (e) {
    throw new CameraUnavailableError(`camera fetch failed: ${(e as Error).message}`)
  }
  if (!res.ok) throw new CameraUnavailableError(`camera responded ${res.status}`)
  return res.arrayBuffer()
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
