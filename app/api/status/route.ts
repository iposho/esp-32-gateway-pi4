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
      { status: 'error', error: (e as Error).message },
      { status: 503 },
    )
  }

  const { data: devices, error } = await supabase
    .from('devices')
    .select('*')

  if (error) {
    return NextResponse.json({ status: 'error', error: error.message }, { status: 500 })
  }

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

  let online = 0
  let offline = 0

  for (const d of (devices as Device[])) {
    const latestRow = latest[d.device_id] ?? null
    const is_online = isDeviceActive(d.last_seen, latestRow?.created_at ?? null)
    if (is_online) {
      online++
    } else {
      offline++
    }
  }

  return NextResponse.json({
    status: 'ok',
    total: devices.length,
    online,
    offline
  })
}
