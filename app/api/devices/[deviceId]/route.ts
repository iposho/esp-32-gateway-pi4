import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

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
