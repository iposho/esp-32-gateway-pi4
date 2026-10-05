import { type NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase/server'
import { loadBirdPhoto } from '@/lib/bird-photos'

export const dynamic = 'force-dynamic'

/**
 * Снимок из архива (scripts/015) по id строки bird_detections: ?detection=N.
 * Для разметки и разбора ошибок модели. Только вход в админку: в архиве и снимки
 * без птиц, на которых бывают люди.
 */
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('detection') ?? ''
  if (!/^\d+$/.test(raw)) return NextResponse.json({ error: 'invalid detection' }, { status: 400 })

  const { data, error } = await getServiceClient()
    .from('bird_detections')
    .select('photo_path')
    .eq('id', Number(raw))
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 503 })
  if (!data?.photo_path) return NextResponse.json({ error: 'no archived photo' }, { status: 404 })

  try {
    const body = await loadBirdPhoto(data.photo_path)
    return new NextResponse(body, {
      headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=86400' },
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }
}
