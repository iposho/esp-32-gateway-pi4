import { NextResponse } from 'next/server'
import { cameraCorsHeaders } from '@/lib/camera-auth'
import { CameraUnavailableError, getBirdShotsWithDetections } from '@/lib/birdfeeder'

export const dynamic = 'force-dynamic'

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cameraCorsHeaders })
}

/** Последние снимки с птицами: [{ id, at, bird, species, … }], новые первыми */
export async function GET() {
  try {
    const shots = await getBirdShotsWithDetections()
    return NextResponse.json(
      { shots },
      { headers: { ...cameraCorsHeaders, 'Cache-Control': 'no-store' } },
    )
  } catch (e) {
    if (e instanceof CameraUnavailableError) {
      return NextResponse.json({ error: 'unavailable' }, { status: 503, headers: cameraCorsHeaders })
    }
    console.error('[Birdfeeder] bird shots failed:', e)
    return NextResponse.json({ error: 'unavailable' }, { status: 503, headers: cameraCorsHeaders })
  }
}
