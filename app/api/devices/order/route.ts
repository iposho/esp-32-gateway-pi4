import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function PUT(req: NextRequest) {
  let supabase
  try {
    supabase = getServiceClient()
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 503 },
    )
  }

  let body: { deviceIds?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  if (!Array.isArray(body.deviceIds)) {
    return NextResponse.json(
      { error: 'Требуется массив deviceIds' },
      { status: 400 },
    )
  }

  const deviceIds = body.deviceIds.filter(
    (id): id is string => typeof id === 'string' && id.length > 0,
  )

  if (deviceIds.length === 0) {
    return NextResponse.json({ error: 'Список устройств пуст' }, { status: 400 })
  }

  const uniqueIds = new Set(deviceIds)
  if (uniqueIds.size !== deviceIds.length) {
    return NextResponse.json(
      { error: 'deviceIds содержит дубликаты' },
      { status: 400 },
    )
  }

  const { data: devices, error: fetchError } = await supabase
    .from('devices')
    .select('device_id, metadata')
    .in('device_id', deviceIds)

  if (fetchError) {
    console.error('[PUT Device order] Fetch error:', fetchError.message)
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  const knownIds = new Set((devices ?? []).map((d) => d.device_id))
  const unknown = deviceIds.filter((id) => !knownIds.has(id))
  if (unknown.length > 0) {
    return NextResponse.json(
      { error: `Неизвестные устройства: ${unknown.join(', ')}` },
      { status: 400 },
    )
  }

  const metadataById = new Map(
    (devices ?? []).map((d) => [d.device_id, d.metadata ?? {}]),
  )

  const updates = deviceIds.map((deviceId, index) =>
    supabase
      .from('devices')
      .update({
        metadata: {
          ...(metadataById.get(deviceId) as Record<string, unknown>),
          sort_order: index,
        },
      })
      .eq('device_id', deviceId),
  )

  const results = await Promise.all(updates)
  const failed = results.find((result) => result.error)
  if (failed?.error) {
    console.error('[PUT Device order] Update error:', failed.error.message)
    return NextResponse.json({ error: failed.error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
