import { NextResponse } from 'next/server'
import { cameraCorsHeaders } from '@/lib/camera-auth'
import { CameraUnavailableError, getLiveFrame } from '@/lib/birdfeeder'

export const dynamic = 'force-dynamic'

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cameraCorsHeaders })
}

/** Живой кадр кормушки (кэш 1 с на всех зрителей) */
export async function GET() {
  try {
    const frame = await getLiveFrame()
    return new NextResponse(frame.body, {
      headers: {
        ...cameraCorsHeaders,
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'no-store',
        'X-Frame-At': new Date(frame.at).toISOString(),
      },
    })
  } catch (e) {
    if (e instanceof CameraUnavailableError) {
      return new NextResponse('Camera unavailable', { status: 503, headers: cameraCorsHeaders })
    }
    console.error('[Birdfeeder] frame failed:', e)
    return new NextResponse('Internal Server Error', { status: 500, headers: cameraCorsHeaders })
  }
}
