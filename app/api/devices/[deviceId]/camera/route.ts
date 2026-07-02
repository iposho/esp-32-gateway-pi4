import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase/server'
import type { Telemetry } from '@/lib/types'

export const dynamic = 'force-dynamic'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ deviceId: string }> },
) {
  const { deviceId } = await params
  console.log(`[Camera Proxy] Request for device: ${deviceId}`)

  let supabase
  try {
    supabase = getServiceClient()
  } catch (e) {
    console.error(`[Camera Proxy] Supabase client error:`, e)
    return new NextResponse('Internal Server Error', { status: 503 })
  }

  // Получаем последнюю телеметрию для этого устройства, чтобы узнать локальный IP-адрес
  const { data: tele, error } = await supabase
    .from('telemetry')
    .select('*')
    .eq('device_id', deviceId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (error || !tele) {
    console.error(`[Camera Proxy] Telemetry not found for ${deviceId}:`, error?.message)
    return new NextResponse('Telemetry not found', { status: 404 })
  }

  const payload = (tele as Telemetry).payload
  const url = payload.last_photo_url as string | undefined

  if (!url) {
    console.error(`[Camera Proxy] No photo URL in telemetry for ${deviceId}`)
    return new NextResponse('No photo URL in telemetry', { status: 404 })
  }

  console.log(`[Camera Proxy] Found URL: ${url} for device ${deviceId}`)

  try {
    // Проксируем запрос к локальному IP-адресу камеры
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000) // 10s timeout
    
    const response = await fetch(url, { 
      cache: 'no-store',
      signal: controller.signal
    })
    
    clearTimeout(timeoutId)

    if (!response.ok) {
      console.error(`[Camera Proxy] Camera returned status ${response.status} ${response.statusText}`)
      return new NextResponse('Error fetching image from camera', { status: 502 })
    }

    const imageBuffer = await response.arrayBuffer()
    console.log(`[Camera Proxy] Successfully fetched image, size: ${imageBuffer.byteLength} bytes`)

    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'no-store, max-age=0',
      },
    })
  } catch (e) {
    console.error(`[Camera Proxy] Fetch error for URL ${url}:`, e)
    return new NextResponse('Failed to connect to camera', { status: 502 })
  }
}

