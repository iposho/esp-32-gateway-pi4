import { type NextRequest, NextResponse } from 'next/server'
import { cameraCorsHeaders } from '@/lib/camera-auth'
import { CameraUnavailableError, getBirdPhoto, getCameraState } from '@/lib/birdfeeder'

export const dynamic = 'force-dynamic'

/** Кольцо снимков на SD камеры (MAX_PHOTOS в прошивке) */
const MAX_PHOTO_ID = 4799

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cameraCorsHeaders })
}

/** Снимок с птицей с SD камеры: ?id=<n> или последний, если id не указан */
export async function GET(request: NextRequest) {
  try {
    const raw = request.nextUrl.searchParams.get('id')
    let id: number | null
    if (raw === null) {
      id = (await getCameraState()).status.birdPhotoId
    } else {
      id = /^\d+$/.test(raw) ? Number(raw) : NaN
      if (!Number.isInteger(id) || id > MAX_PHOTO_ID) {
        return new NextResponse('Invalid id', { status: 400, headers: cameraCorsHeaders })
      }
    }
    if (id === null) {
      return new NextResponse('No bird photos yet', { status: 404, headers: cameraCorsHeaders })
    }

    const photo = await getBirdPhoto(id)
    return new NextResponse(photo.body, {
      headers: {
        ...cameraCorsHeaders,
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'private, max-age=600',
        'X-Photo-Id': String(id),
      },
    })
  } catch (e) {
    if (e instanceof CameraUnavailableError) {
      return new NextResponse('Camera unavailable', { status: 503, headers: cameraCorsHeaders })
    }
    console.error('[Birdfeeder] bird photo failed:', e)
    return new NextResponse('Internal Server Error', { status: 500, headers: cameraCorsHeaders })
  }
}
