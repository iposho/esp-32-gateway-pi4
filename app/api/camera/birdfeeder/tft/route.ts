import { type NextRequest, NextResponse } from 'next/server'
import { getLatestBirdTft, TFT_HEIGHT, TFT_WIDTH } from '@/lib/bird-tft'
import { cameraCorsHeaders } from '@/lib/camera-auth'
import { CameraUnavailableError } from '@/lib/birdfeeder'

export const dynamic = 'force-dynamic'

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cameraCorsHeaders })
}

/**
 * Последняя подтверждённая птица для дисплея esp32-flat: сырой RGB565
 * little-endian 160×120 (38 400 байт). Плата шлёт If-None-Match с прошлым
 * ETag и получает 304, пока новой птицы нет.
 */
export async function GET(request: NextRequest) {
  try {
    const image = await getLatestBirdTft()
    if (!image) {
      return new NextResponse('No bird photos yet', { status: 404, headers: cameraCorsHeaders })
    }

    const etag = `"${image.key}"`
    const headers: Record<string, string> = {
      ...cameraCorsHeaders,
      'Cache-Control': 'no-store',
      ETag: etag,
      'X-Shot-At': String(Math.floor(Date.parse(image.at) / 1000)),
      'X-Image-Size': `${TFT_WIDTH}x${TFT_HEIGHT}`,
    }
    // Заголовки только ASCII; латинское название им и является
    const latin = image.latin?.replace(/[^\x20-\x7e]/g, '')
    if (latin) headers['X-Species'] = latin

    if (request.headers.get('if-none-match') === etag) {
      return new NextResponse(null, { status: 304, headers })
    }
    return new NextResponse(new Uint8Array(image.body), {
      headers: { ...headers, 'Content-Type': 'application/octet-stream' },
    })
  } catch (e) {
    if (e instanceof CameraUnavailableError) {
      return new NextResponse('Camera unavailable', { status: 503, headers: cameraCorsHeaders })
    }
    console.error('[Birdfeeder] tft failed:', e)
    return new NextResponse('Internal Server Error', { status: 500, headers: cameraCorsHeaders })
  }
}
