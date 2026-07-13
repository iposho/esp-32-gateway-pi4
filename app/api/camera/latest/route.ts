import { NextResponse } from 'next/server'
import { cameraCorsHeaders } from '@/lib/camera-auth'
import { getServiceClient } from '@/lib/supabase/server'
import type { Telemetry } from '@/lib/types'

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cameraCorsHeaders })
}

export const dynamic = 'force-dynamic'

export async function GET() {
  let supabase
  try {
    supabase = getServiceClient()
  } catch (e) {
    return new NextResponse('Internal Server Error', { status: 503 })
  }

  // Находим последнюю телеметрию с last_photo_url среди всех устройств
  const { data: tele, error } = await supabase
    .from('telemetry')
    .select('*')
    .not('payload->>last_photo_url', 'is', null)
    .neq('payload->>last_photo_url', '')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !tele) {
    return NextResponse.json(
      { error: 'No camera snapshot available' },
      { status: 404 },
    )
  }

  const t = tele as Telemetry
  const url = t.payload.last_photo_url as string

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 8_000)

    const response = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
      headers: { Accept: 'image/jpeg' },
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      console.error(`[Camera Latest] Camera returned status ${response.status} ${response.statusText}`)
      return new NextResponse('Error fetching image from camera', { status: 502 })
    }

    const imageBuffer = await response.arrayBuffer()
    console.log(`[Camera Latest] Successfully fetched image, size: ${imageBuffer.byteLength} bytes`)

    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        ...cameraCorsHeaders,
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'no-store, max-age=0',
        'X-Device-Id': t.device_id,
        'X-Timestamp': t.created_at,
      },
    })
  } catch (e) {
    const isTimeout = e instanceof DOMException && e.name === 'AbortError'
    if (isTimeout) {
      console.error(`[Camera Latest] Timeout fetching ${url} (8s elapsed) — camera may be offline`)
      return new NextResponse('Camera did not respond in time', { status: 504 })
    }
    console.error(`[Camera Latest] Fetch error for URL ${url}:`, e)
    return new NextResponse('Failed to connect to camera', { status: 502 })
  }
}
