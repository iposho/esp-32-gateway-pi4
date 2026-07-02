import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase/server'
import type { Telemetry } from '@/lib/types'

export const dynamic = 'force-dynamic'

export async function GET(
  req: Request,
  { params }: { params: { deviceId: string } },
) {
  const { deviceId } = params

  let supabase
  try {
    supabase = getServiceClient()
  } catch (e) {
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
    return new NextResponse('Telemetry not found', { status: 404 })
  }

  const payload = (tele as Telemetry).payload
  const url = payload.last_photo_url as string | undefined

  if (!url) {
    return new NextResponse('No photo URL in telemetry', { status: 404 })
  }

  try {
    // Проксируем запрос к локальному IP-адресу камеры
    const response = await fetch(url, { cache: 'no-store' })
    if (!response.ok) {
      return new NextResponse('Error fetching image from camera', { status: 502 })
    }

    const imageBuffer = await response.arrayBuffer()

    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'no-store, max-age=0',
      },
    })
  } catch (e) {
    return new NextResponse('Failed to connect to camera', { status: 502 })
  }
}
