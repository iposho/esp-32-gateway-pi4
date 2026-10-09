import { getServiceClient } from '@/lib/supabase/server'
import { type BirdShot, getBirdfeederDeviceId } from '@/lib/birdfeeder'

/**
 * Архив снимков, которые видела модель: Supabase Storage, бакет bird-photos
 * (scripts/015). Кольцо SD камеры перезаписывается, а без архива не проверить
 * старые ответы, не сравнить модели и промпты (/api/birdfeeder/eval).
 * Хранятся только снимки, ушедшие в модель (не ночь и не темнота): их не больше
 * BIRD_AI_DAILY_LIMIT в сутки, по 20–60 КБ. BIRD_AI_SAVE_PHOTOS=0 — не хранить.
 *
 * Неразмеченные снимки старше BIRD_AI_PHOTO_RETENTION_DAYS (по умолчанию 90) раз в
 * сутки удаляются из Storage; строки bird_detections остаются, у них очищается
 * photo_path, так что статистика и визиты не меняются.
 */

export const BIRD_PHOTOS_BUCKET = 'bird-photos'
const STORAGE_TIMEOUT_MS = 10_000
const DEFAULT_RETENTION_DAYS = 90
const CLEANUP_INTERVAL_MS = 24 * 60 * 60_000
/** Первая очистка — вскоре после старта, чтобы не ждать сутки после рестарта */
const CLEANUP_FIRST_DELAY_MS = 5 * 60_000
const CLEANUP_BATCH = 200
/** Не больше стольких пачек за проход: остальное уйдёт в следующие сутки */
const CLEANUP_MAX_BATCHES = 50

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

/** Сколько дней хранить неразмеченные снимки; 0 — не удалять */
export function getBirdPhotoRetentionDays(): number {
  const raw = process.env.BIRD_AI_PHOTO_RETENTION_DAYS
  const n = raw === undefined || raw === '' ? NaN : Number(raw)
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_RETENTION_DAYS
}

/**
 * Удалить из архива неразмеченные снимки старше срока хранения. Не трогает:
 * - размеченные (label_bird) — это набор для /api/birdfeeder/eval;
 * - кадры для сравнения, на которые ссылаются размеченные строки (reference_path);
 * - снимок последней подтверждённой птицы — его показывает дисплей (lib/bird-tft.ts).
 * Сначала файл удаляется из Storage, потом у строки очищается photo_path: если второе
 * не удалось, следующий проход повторит оба шага (удаление отсутствующего файла — не ошибка).
 */
export async function cleanupBirdPhotos(now = Date.now()): Promise<number> {
  const days = getBirdPhotoRetentionDays()
  if (days === 0) return 0
  const cutoff = new Date(now - days * 86_400_000).toISOString()
  const supabase = getServiceClient()
  const deviceId = getBirdfeederDeviceId()

  const [refsRes, latestRes] = await Promise.all([
    supabase
      .from('bird_detections')
      .select('reference_path')
      .eq('device_id', deviceId)
      .filter('label_bird', 'not.is', null)
      .filter('reference_path', 'not.is', null),
    supabase
      .from('bird_detections')
      .select('id')
      .eq('device_id', deviceId)
      .eq('is_bird', true)
      .order('shot_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  const err = refsRes.error ?? latestRes.error
  if (err) throw new Error(err.message)
  const keepPaths = new Set((refsRes.data ?? []).map((r) => r.reference_path as string))
  const keepId = (latestRes.data?.id as number | undefined) ?? null

  let removed = 0
  let afterId = 0
  for (let batch = 0; batch < CLEANUP_MAX_BATCHES; batch++) {
    const { data, error } = await supabase
      .from('bird_detections')
      .select('id, photo_path')
      .eq('device_id', deviceId)
      .is('label_bird', null)
      .filter('photo_path', 'not.is', null)
      .lt('shot_at', cutoff)
      .gt('id', afterId)
      .order('id', { ascending: true })
      .limit(CLEANUP_BATCH)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as Array<{ id: number; photo_path: string }>
    if (rows.length === 0) break
    afterId = rows[rows.length - 1].id

    const doomed = rows.filter((r) => r.id !== keepId && !keepPaths.has(r.photo_path))
    if (doomed.length > 0) {
      const { error: rmErr } = await supabase.storage.from(BIRD_PHOTOS_BUCKET).remove(doomed.map((r) => r.photo_path))
      if (rmErr) throw new Error(`storage remove: ${rmErr.message}`)
      const { error: upErr } = await supabase
        .from('bird_detections')
        .update({ photo_path: null })
        .in('id', doomed.map((r) => r.id))
      if (upErr) throw new Error(upErr.message)
      removed += doomed.length
    }
    if (rows.length < CLEANUP_BATCH) break
  }
  return removed
}

const globalForCleanup = globalThis as unknown as { __birdPhotoCleanup?: NodeJS.Timeout }

/** Запускается один раз на процесс из instrumentation.ts */
export function startBirdPhotoCleanup(): void {
  if (globalForCleanup.__birdPhotoCleanup) return
  const days = getBirdPhotoRetentionDays()
  // Работает и при BIRD_AI_SAVE_PHOTOS=0: уже накопленное тоже должно стареть
  if (days === 0) {
    console.log('[BirdAI] archive cleanup disabled (BIRD_AI_PHOTO_RETENTION_DAYS=0)')
    return
  }
  const run = () => {
    cleanupBirdPhotos()
      .then((n) => {
        if (n > 0) console.log(`[BirdAI] archive cleanup: removed ${n} unlabeled photos older than ${days} days`)
      })
      .catch((e: unknown) => console.warn(`[BirdAI] archive cleanup failed: ${(e as Error).message}`))
  }
  setTimeout(run, CLEANUP_FIRST_DELAY_MS).unref()
  globalForCleanup.__birdPhotoCleanup = setInterval(run, CLEANUP_INTERVAL_MS)
  globalForCleanup.__birdPhotoCleanup.unref()
}
