import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase/server'
import {
  extractCameraFields,
  groupTelemetryByDevice,
  indexLatestPerDevice,
  mergeCameraFieldsIntoTelemetry,
  mergeTelemetryRows,
} from '@/lib/telemetry'
import { isDeviceActive, type Device, type Telemetry } from '@/lib/types'

export const dynamic = 'force-dynamic'

export async function GET() {
  let supabase
  try {
    supabase = getServiceClient()
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message, devices: [] },
      { status: 503 },
    )
  }

  const { data: devices, error } = await supabase
    .from('devices')
    .select('*')
    .order('name', { ascending: true })

  if (error) {
    console.log('[v0] devices query error:', error.message)
    return NextResponse.json({ error: error.message, devices: [] }, { status: 500 })
  }

  // Последняя телеметрия по каждому устройству + «липкие» поля камеры из истории
  const ids = (devices as Device[]).map((d) => d.device_id)
  const latest: Record<string, Telemetry | null> = {}
  const cameraFieldsByDevice: Record<string, ReturnType<typeof extractCameraFields>> = {}

  if (ids.length) {
    const [{ data: tele }, { data: cameraTele }] = await Promise.all([
      supabase
        .from('telemetry')
        .select('*')
        .in('device_id', ids)
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('telemetry')
        .select('*')
        .in('device_id', ids)
        .or('payload->>last_photo_url.not.is.null,payload->>camera_ready.not.is.null')
        .order('created_at', { ascending: false })
        .limit(200),
    ])

    const mergedRows = mergeTelemetryRows(tele as Telemetry[], cameraTele as Telemetry[])
    const latestByDevice = indexLatestPerDevice(mergedRows)
    const grouped = groupTelemetryByDevice(mergedRows)

    for (const deviceId of ids) {
      latest[deviceId] = latestByDevice[deviceId] ?? null
      cameraFieldsByDevice[deviceId] = extractCameraFields(grouped[deviceId] ?? [])
    }
  }

  const result = (devices as Device[]).map((d) => {
    const latestRow = mergeCameraFieldsIntoTelemetry(
      latest[d.device_id] ?? null,
      cameraFieldsByDevice[d.device_id] ?? {},
    )
    return {
      ...d,
      is_online: isDeviceActive(d.last_seen, latestRow?.created_at ?? null),
      latest: latestRow,
    }
  })

  return NextResponse.json({ devices: result })
}
