import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase/server'
import { capabilitiesTopic } from '@/lib/commands'
import { clearRetained } from '@/lib/mqtt'
import {
  extractCameraFields,
  groupTelemetryByDevice,
  indexLatestPerDevice,
  mergeCameraFieldsIntoTelemetry,
  mergeTelemetryRows,
} from '@/lib/telemetry'
import { isDeviceActive, type Device, type Telemetry } from '@/lib/types'

export const dynamic = 'force-dynamic'

/** Строк за один вызов purge_device_rows — с запасом до statement_timeout */
const PURGE_BATCH_SIZE = 5000

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ deviceId: string }> },
) {
  let supabase
  try {
    supabase = getServiceClient()
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 503 },
    )
  }

  const { deviceId } = await params

  if (!deviceId) {
    return NextResponse.json({ error: 'Device ID is required' }, { status: 400 })
  }

  const { data: device, error } = await supabase
    .from('devices')
    .select('*')
    .eq('device_id', deviceId)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!device) {
    return NextResponse.json({ error: 'Устройство не найдено' }, { status: 404 })
  }

  const [{ data: tele }, { data: cameraTele }] = await Promise.all([
    supabase
      .from('telemetry')
      .select('*')
      .eq('device_id', deviceId)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('telemetry')
      .select('*')
      .eq('device_id', deviceId)
      .or('payload->>last_photo_url.not.is.null,payload->>camera_ready.not.is.null')
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  const mergedRows = mergeTelemetryRows(tele as Telemetry[], cameraTele as Telemetry[])
  const latestByDevice = indexLatestPerDevice(mergedRows)
  const grouped = groupTelemetryByDevice(mergedRows)
  const cameraFields = extractCameraFields(grouped[deviceId] ?? [])
  const latestRow = mergeCameraFieldsIntoTelemetry(
    latestByDevice[deviceId] ?? null,
    cameraFields,
  )

  const result = {
    ...(device as Device),
    is_online: isDeviceActive(
      (device as Device).last_seen,
      latestRow?.created_at ?? null,
    ),
    latest: latestRow,
  }

  return NextResponse.json({ device: result })
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ deviceId: string }> },
) {
  let supabase
  try {
    supabase = getServiceClient()
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 503 },
    )
  }

  const { deviceId } = await params

  if (!deviceId) {
    return NextResponse.json({ error: 'Device ID is required' }, { status: 400 })
  }

  let body: { name?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) {
    return NextResponse.json({ error: 'Название не может быть пустым' }, { status: 400 })
  }
  if (name.length > 100) {
    return NextResponse.json({ error: 'Название слишком длинное (макс. 100 символов)' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('devices')
    .update({ name })
    .eq('device_id', deviceId)
    .select('*')
    .single()

  if (error) {
    console.error('[PATCH Device] Update error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ error: 'Устройство не найдено' }, { status: 404 })
  }

  return NextResponse.json({ device: data })
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ deviceId: string }> },
) {
  let supabase
  try {
    supabase = getServiceClient()
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 503 },
    )
  }

  const { deviceId } = await params

  if (!deviceId) {
    return NextResponse.json({ error: 'Device ID is required' }, { status: 400 })
  }

  // 1. «Надгробие»: пока оно есть, Node-RED не пересоздаст устройство
  //    из телеметрии/retained-сообщений (см. scripts/006_deleted_devices.sql)
  const { error: tombError } = await supabase
    .from('deleted_devices')
    .upsert({ device_id: deviceId, deleted_at: new Date().toISOString() })

  if (tombError) {
    console.error('[DELETE Device] Tombstone error:', tombError.message)
    return NextResponse.json(
      {
        error: `Не удалось пометить устройство удалённым: ${tombError.message}. Примените scripts/006_deleted_devices.sql`,
      },
      { status: 500 },
    )
  }

  // 2. Стираем retained-сообщения устройства в брокере, иначе они
  //    прилетают в Node-RED при каждом переподключении: status и
  //    capabilities оседают в mqtt_events, а telemetry — ещё и в
  //    таблице telemetry. Топики devices/<id>/out/… не чистим: их
  //    имена задаёт прошивка, перечислить их заранее нельзя.
  const retainedResults = await Promise.allSettled([
    clearRetained(`devices/${deviceId}/status`),
    clearRetained(`devices/${deviceId}/telemetry`),
    clearRetained(capabilitiesTopic(deviceId)),
  ])
  for (const r of retainedResults) {
    if (r.status === 'rejected') {
      console.error('[DELETE Device] Clear retained error:', String(r.reason))
    }
  }

  // 3. Чистим историю пачками: одним каскадным DELETE сотни тысяч строк
  //    телеметрии не укладываются в statement_timeout
  //    (см. scripts/007_purge_device_rows.sql)
  for (;;) {
    const { data: purged, error: purgeError } = await supabase.rpc('purge_device_rows', {
      p_device_id: deviceId,
      p_limit: PURGE_BATCH_SIZE,
    })

    if (purgeError) {
      console.error('[DELETE Device] Purge error:', purgeError.message)
      return NextResponse.json(
        {
          error: `Не удалось очистить историю устройства: ${purgeError.message}. Примените scripts/007_purge_device_rows.sql`,
        },
        { status: 500 },
      )
    }

    if (!purged) break
  }

  // 4. Удаляем устройство; оставшиеся строки (если успели прийти) — каскадом
  const { data: deleted, error } = await supabase
    .from('devices')
    .delete()
    .eq('device_id', deviceId)
    .select('device_id')

  if (error) {
    console.error('[DELETE Device] Device deletion error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!deleted?.length) {
    return NextResponse.json({ error: 'Устройство не найдено' }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
