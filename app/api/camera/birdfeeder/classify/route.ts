import { type NextRequest, NextResponse } from 'next/server'
import { classifyBirdPhoto, isBirdAiEnabled } from '@/lib/bird-ai'
import { CameraUnavailableError, getBirdPhoto } from '@/lib/birdfeeder'

export const dynamic = 'force-dynamic'

/** Кольцо снимков на SD камеры (MAX_PHOTOS в прошивке) */
const MAX_PHOTO_ID = 4799

/**
 * Отладка промпта: прогнать снимок ?id=N через модель и вернуть ответ.
 * В bird_detections не пишет и в дневной лимит не входит, но вызов платный.
 * POST, чтобы снимок не уходил в модель от случайного GET.
 */
export async function POST(request: NextRequest) {
  if (!isBirdAiEnabled()) {
    return NextResponse.json({ error: 'AI_GATEWAY_API_KEY is not set' }, { status: 503 })
  }
  const raw = request.nextUrl.searchParams.get('id') ?? ''
  const id = /^\d+$/.test(raw) ? Number(raw) : NaN
  if (!Number.isInteger(id) || id > MAX_PHOTO_ID) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  }

  try {
    const photo = await getBirdPhoto(id)
    const startedAt = Date.now()
    const result = await classifyBirdPhoto(photo.body)
    return NextResponse.json(
      { id, ...result, ms: Date.now() - startedAt },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (e) {
    if (e instanceof CameraUnavailableError) {
      return NextResponse.json({ error: 'camera unavailable' }, { status: 503 })
    }
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }
}
