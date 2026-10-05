import { NextResponse } from 'next/server'
import { cameraCorsHeaders } from '@/lib/camera-auth'
import { getBirdAiUsage } from '@/lib/bird-ai-usage'

export const dynamic = 'force-dynamic'

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cameraCorsHeaders })
}

/**
 * Расход модели для админки kuzyak.in (блок «Расход распознавания»): сайт ходит сюда
 * с сервера с CAMERA_API_TOKEN, в браузер токен не уходит. Дашборд шлюза — /api/birdfeeder/usage.
 */
export async function GET() {
  try {
    const usage = await getBirdAiUsage()
    return NextResponse.json(usage, {
      headers: { ...cameraCorsHeaders, 'Cache-Control': 'no-store' },
    })
  } catch (e) {
    console.error('[BirdAI] usage failed:', e)
    return NextResponse.json({ error: 'unavailable' }, { status: 503, headers: cameraCorsHeaders })
  }
}
