import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase/server'
import { MQTT_EVENT_TYPES, type MqttEventType } from '@/lib/mqtt-events'

export const dynamic = 'force-dynamic'

type StatsRow = {
  event_type: MqttEventType
  device_id: string | null
  created_at: string
}

export async function GET() {
  let supabase
  try {
    supabase = getServiceClient()
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 503 })
  }

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('mqtt_events')
    .select('event_type, device_id, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(5000)

  if (error) {
    console.log('[v0] mqtt stats query error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (data ?? []) as StatsRow[]
  const total = rows.length
  const byType: Record<MqttEventType, number> = Object.fromEntries(
    MQTT_EVENT_TYPES.map((t) => [t, 0]),
  ) as Record<MqttEventType, number>

  const byDevice: Record<string, number> = {}
  const minuteBuckets: Record<string, number> = {}

  for (const row of rows) {
    byType[row.event_type] = (byType[row.event_type] ?? 0) + 1
    if (row.device_id) {
      byDevice[row.device_id] = (byDevice[row.device_id] ?? 0) + 1
    }
    const minute = row.created_at.slice(0, 16)
    minuteBuckets[minute] = (minuteBuckets[minute] ?? 0) + 1
  }

  const topDevices = Object.entries(byDevice)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([device_id, count]) => ({ device_id, count }))

  const messagesPerMinute = total > 0 ? Math.round((total / 60) * 10) / 10 : 0

  return NextResponse.json({
    window_minutes: 60,
    total,
    messages_per_minute: messagesPerMinute,
    by_type: byType,
    top_devices: topDevices,
    minute_buckets: minuteBuckets,
  })
}
