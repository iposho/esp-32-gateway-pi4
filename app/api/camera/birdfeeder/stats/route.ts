import { NextResponse } from 'next/server'
import { cameraCorsHeaders } from '@/lib/camera-auth'
import { getBirdStats } from '@/lib/bird-stats'

export const dynamic = 'force-dynamic'

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cameraCorsHeaders })
}

/** Статистика по подтверждённым птицам: виды, рекорды, визиты по часам и дням (кэш 5 мин) */
export async function GET() {
  try {
    const stats = await getBirdStats()
    return NextResponse.json(stats, {
      headers: { ...cameraCorsHeaders, 'Cache-Control': 'no-store' },
    })
  } catch (e) {
    console.error('[Birdfeeder] stats failed:', e)
    return NextResponse.json({ error: 'unavailable' }, { status: 503, headers: cameraCorsHeaders })
  }
}
