import { getServiceClient } from '@/lib/supabase/server'
import { type BirdShot, getBirdfeederDeviceId } from '@/lib/birdfeeder'

/**
 * Архив снимков, которые видела модель: Supabase Storage, бакет bird-photos
 * (scripts/015). Кольцо SD камеры перезаписывается, а без архива не проверить
 * старые ответы, не сравнить модели и промпты (/api/birdfeeder/eval).
 * Хранятся только снимки, ушедшие в модель (не ночь и не темнота): их не больше
 * BIRD_AI_DAILY_LIMIT в сутки, по 20–60 КБ. BIRD_AI_SAVE_PHOTOS=0 — не хранить.
 */

export const BIRD_PHOTOS_BUCKET = 'bird-photos'
const STORAGE_TIMEOUT_MS = 10_000

let storageBroken = false

export function isBirdPhotoArchiveEnabled(): boolean {
  return process.env.BIRD_AI_SAVE_PHOTOS !== '0'
}

/** esp32-bird-cam/2026-10-06/1234-1791234567.jpg — дата и время съёмки по UTC */
function photoPath(shot: BirdShot): string {
  const ms = Date.parse(shot.at)
  return `${getBirdfeederDeviceId()}/${new Date(ms).toISOString().slice(0, 10)}/${shot.id}-${Math.floor(ms / 1000)}.jpg`
}

/** Путь в бакете или null: архив выключен или Storage недоступен. Не бросает */
export async function saveBirdPhoto(shot: BirdShot, jpeg: ArrayBuffer): Promise<string | null> {
  if (!isBirdPhotoArchiveEnabled() || storageBroken) return null
  const path = photoPath(shot)
  try {
    const { error } = await getServiceClient()
      .storage.from(BIRD_PHOTOS_BUCKET)
      .upload(path, jpeg, { contentType: 'image/jpeg', upsert: true })
    if (!error) return path
    // Нет бакета (не применён 015) — до рестарта не пробуем, чтобы не сыпать в лог
    if (/bucket not found/i.test(error.message)) {
      storageBroken = true
      console.warn('[BirdAI] no storage bucket bird-photos — apply scripts/015_bird_photos.sql and restart admin')
    } else {
      console.warn(`[BirdAI] photo ${shot.id} not archived: ${error.message}`)
    }
  } catch (e) {
    console.warn(`[BirdAI] photo ${shot.id} not archived: ${(e as Error).message}`)
  }
  return null
}

export async function loadBirdPhoto(path: string): Promise<ArrayBuffer> {
  const { data, error } = await getServiceClient()
    .storage.from(BIRD_PHOTOS_BUCKET)
    .download(path, {}, { signal: AbortSignal.timeout(STORAGE_TIMEOUT_MS) })
  if (error || !data) throw new Error(`storage ${path}: ${error?.message ?? 'empty'}`)
  return data.arrayBuffer()
}
