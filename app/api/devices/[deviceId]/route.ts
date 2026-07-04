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

  // Delete from devices table. 
  // We'll delete telemetry explicitly just in case to be safe, if there's no FK constraint.
  const { error: teleError } = await supabase
    .from('telemetry')
    .delete()
    .eq('device_id', deviceId)

  if (teleError) {
    console.error('[DELETE Device] Telemetry deletion error:', teleError.message)
    return NextResponse.json({ error: teleError.message }, { status: 500 })
  }

  const { error } = await supabase
    .from('devices')
    .delete()
    .eq('device_id', deviceId)

  if (error) {
    console.error('[DELETE Device] Device deletion error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
