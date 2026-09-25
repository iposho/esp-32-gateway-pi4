import { NextResponse } from 'next/server'
import { cameraCorsHeaders } from '@/lib/camera-auth'
import { getCameraState } from '@/lib/birdfeeder'

export const dynamic = 'force-dynamic'

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cameraCorsHeaders })
}

/** Статус кормушки: онлайн, день/ночь, последний визит птицы */
export async function GET() {
  try {
    const { status } = await getCameraState()
    return NextResponse.json(status, {
      headers: { ...cameraCorsHeaders, 'Cache-Control': 'no-store' },
    })
  } catch (e) {
    console.error('[Birdfeeder] status failed:', e)
    return NextResponse.json({ error: 'unavailable' }, { status: 503, headers: cameraCorsHeaders })
  }
}
