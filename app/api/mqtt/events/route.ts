import { NextResponse, type NextRequest } from 'next/server'
import { getServiceClient } from '@/lib/supabase/server'
import { MQTT_EVENT_TYPES, type MqttEventType } from '@/lib/mqtt-events'

export const dynamic = 'force-dynamic'

const MAX_LIMIT = 500
const DEFAULT_LIMIT = 100

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const limit = Math.min(
    Math.max(parseInt(searchParams.get('limit') ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT, 1),
    MAX_LIMIT,
  )
  const deviceId = searchParams.get('device_id')
  const eventType = searchParams.get('event_type')
  const topic = searchParams.get('topic')
  const before = searchParams.get('before')
  const after = searchParams.get('after')

  if (eventType && !MQTT_EVENT_TYPES.includes(eventType as MqttEventType)) {
    return NextResponse.json({ error: 'Invalid event_type' }, { status: 400 })
  }

  let supabase
  try {
    supabase = getServiceClient()
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, events: [] }, { status: 503 })
  }

  let query = supabase
    .from('mqtt_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (deviceId) query = query.eq('device_id', deviceId)
  if (eventType) query = query.eq('event_type', eventType)
  if (topic) query = query.ilike('topic', `%${topic}%`)
  if (before) query = query.lt('created_at', before)
  if (after) query = query.gt('created_at', after)

  const { data, error } = await query

  if (error) {
    console.log('[v0] mqtt_events query error:', error.message)
    return NextResponse.json({ error: error.message, events: [] }, { status: 500 })
  }

  return NextResponse.json({ events: data ?? [] })
}
