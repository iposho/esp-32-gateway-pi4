import { decode as decodeJpeg } from 'jpeg-js'
import { loadBirdPhoto } from '@/lib/bird-photos'
import { normalizeSpecies } from '@/lib/bird-species'
import { getBirdPhoto, getBirdfeederDeviceId, shotKey } from '@/lib/birdfeeder'
import { getServiceClient } from '@/lib/supabase/server'

/**
 * Последняя подтверждённая птица для экрана esp32-flat (ST7735 160×128):
 * готовая картинка RGB565, чтобы плата не декодировала JPEG, а лила байты
 * прямо в дисплей. 160×120 — кадр 4:3, снизу остаётся строка под подпись.
 */

export const TFT_WIDTH = 160
export const TFT_HEIGHT = 120

const DB_TIMEOUT_MS = 5_000
/** Плата опрашивает раз в полминуты, пока экран открыт; чаще в БД не ходим */
const LATEST_TTL_MS = 10_000

export type BirdTftImage = {
  /** RGB565 little-endian, TFT_WIDTH × TFT_HEIGHT, строки сверху вниз */
  body: Buffer
  /** Меняется вместе со снимком — для ETag / If-None-Match */
  key: string
  /** Время снимка (ISO) */
  at: string
  /** Латинское название: в шрифте дисплея нет кириллицы */
  latin: string | null
}

type LatestBird = {
  photo_id: number
  shot_at: string
  species: string | null
  species_latin: string | null
  photo_path: string | null
}

/**
 * JPEG → RGB565 нужного размера: обрезка по центру до пропорций экрана
 * и усреднение блоков. null — JPEG не разобрался.
 */
export function jpegToRgb565(jpeg: ArrayBuffer, width = TFT_WIDTH, height = TFT_HEIGHT): Buffer | null {
  try {
    const img = decodeJpeg(new Uint8Array(jpeg), { useTArray: true, formatAsRGBA: true, maxResolutionInMP: 4 })
    let cropW = img.width
    let cropH = Math.round((img.width * height) / width)
    if (cropH > img.height) {
      cropH = img.height
      cropW = Math.round((img.height * width) / height)
    }
    const x0 = (img.width - cropW) >> 1
    const y0 = (img.height - cropH) >> 1

    const out = Buffer.alloc(width * height * 2)
    for (let y = 0; y < height; y++) {
      const sy0 = y0 + Math.floor((y * cropH) / height)
      const sy1 = Math.max(sy0 + 1, y0 + Math.floor(((y + 1) * cropH) / height))
      for (let x = 0; x < width; x++) {
        const sx0 = x0 + Math.floor((x * cropW) / width)
        const sx1 = Math.max(sx0 + 1, x0 + Math.floor(((x + 1) * cropW) / width))
        let r = 0
        let g = 0
        let b = 0
        for (let sy = sy0; sy < sy1; sy++) {
          for (let sx = sx0; sx < sx1; sx++) {
            const i = (sy * img.width + sx) * 4
            r += img.data[i]
            g += img.data[i + 1]
            b += img.data[i + 2]
          }
        }
        const n = (sy1 - sy0) * (sx1 - sx0)
        const rgb565 = (((r / n) >> 3) << 11) | (((g / n) >> 2) << 5) | ((b / n) >> 3)
        out.writeUInt16LE(rgb565, (y * width + x) * 2)
      }
    }
    return out
  } catch {
    return null
  }
}

async function loadLatestBird(): Promise<LatestBird | null> {
  const { data, error } = await getServiceClient()
    .from('bird_detections')
    .select('photo_id, shot_at, species, species_latin, photo_path')
    .eq('device_id', getBirdfeederDeviceId())
    .eq('is_bird', true)
    .order('shot_at', { ascending: false })
    .limit(1)
    .abortSignal(AbortSignal.timeout(DB_TIMEOUT_MS))
    .maybeSingle()
  if (error) throw new Error(`detections unavailable: ${error.message}`)
  return data as LatestBird | null
}

/** Архив в Storage переживает и кольцо SD, и выключенную камеру; SD — запасной путь */
async function loadJpeg(bird: LatestBird): Promise<ArrayBuffer> {
  if (bird.photo_path) {
    try {
      return await loadBirdPhoto(bird.photo_path)
    } catch (e) {
      console.warn(`[Birdfeeder] tft: archive miss, trying camera: ${(e as Error).message}`)
    }
  }
  return (await getBirdPhoto(bird.photo_id)).body
}

let latest: { at: number; value: Promise<BirdTftImage | null> } | null = null
let rendered: BirdTftImage | null = null

async function render(): Promise<BirdTftImage | null> {
  const bird = await loadLatestBird()
  if (!bird) return null
  const key = shotKey(bird.photo_id, bird.shot_at)
  if (rendered?.key === key) return rendered

  const body = jpegToRgb565(await loadJpeg(bird))
  if (!body) throw new Error(`photo ${bird.photo_id}: bad jpeg`)
  rendered = {
    body,
    key,
    at: bird.shot_at,
    latin: normalizeSpecies(bird.species, bird.species_latin).latin,
  }
  return rendered
}

/** null — подтверждённых птиц ещё нет. Бросает CameraUnavailableError, если снимок взять неоткуда */
export function getLatestBirdTft(): Promise<BirdTftImage | null> {
  if (latest && Date.now() - latest.at < LATEST_TTL_MS) return latest.value
  const value = render()
  const entry = { at: Date.now(), value }
  latest = entry
  value.catch(() => {
    if (latest === entry) latest = null
  })
  return value
}
