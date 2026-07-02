import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase/server'
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

  // Последняя телеметрия по каждому устройству
  const ids = (devices as Device[]).map((d) => d.device_id)
  const latest: Record<string, Telemetry | null> = {}

  if (ids.length) {
    const { data: tele } = await supabase
      .from('telemetry')
      .select('*')
      .in('device_id', ids)
      .order('created_at', { ascending: false })
      .limit(200)

    for (const row of (tele ?? []) as Telemetry[]) {
      if (!latest[row.device_id]) latest[row.device_id] = row
    }
  }

  const result = (devices as Device[]).map((d) => {
    const latestRow = latest[d.device_id] ?? null
    return {
      ...d,
      is_online: isDeviceActive(d.last_seen, latestRow?.created_at ?? null),
      latest: latestRow,
    }
  })

  return NextResponse.json({ devices: result })
}
