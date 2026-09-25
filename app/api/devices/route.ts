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

/**
 * Насколько назад искать «липкие» поля камеры (`last_photo_url`,
 * `camera_ready`).
 *
 * Без ограничения по времени этот запрос сканирует всю телеметрию: фильтр
 * `payload->>key is not null` не покрыт индексом, а сами payload лежат
 * в TOAST — 1,15 млн строк читались ~4 с. Админка опрашивает эндпоинт
 * каждые 3 с, цикл опроса растягивался до ~7 с, и команды не успевали
 * подтвердиться — UI показывал «устройство не подтвердило команду».
 * Час даёт ~360 строк на активное устройство (телеметрия раз в 10 с),
 * это ~70 мс; более старый снимок на дашборде неактуален.
 */
const CAMERA_LOOKBACK_HOURS = 1

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
        .gte(
          'created_at',
          new Date(Date.now() - CAMERA_LOOKBACK_HOURS * 3_600_000).toISOString(),
        )
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
