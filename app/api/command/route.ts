import { NextResponse, type NextRequest } from 'next/server'
import { getServiceClient } from '@/lib/supabase/server'
import { publishCommand } from '@/lib/mqtt'

export const dynamic = 'force-dynamic'

/**
 * Отправка команды на устройство.
 * По умолчанию топик: esp32/<deviceId>/cmd
 * payload — произвольный JSON, например { "relay": 1, "state": "on" }
 */
export async function POST(req: NextRequest) {
  let body: { deviceId?: string; topic?: string; payload?: Record<string, unknown> }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const { deviceId, payload } = body
  if (!deviceId || typeof payload !== 'object' || payload === null) {
    return NextResponse.json(
      { error: 'Требуются deviceId и payload (объект)' },
      { status: 400 },
    )
  }

  const topic = body.topic || `esp32/${deviceId}/cmd`
  const supabase = getServiceClient()

  try {
    await publishCommand(topic, payload)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'MQTT publish failed'
    console.log('[v0] command publish error:', message)
    await supabase.from('commands').insert({
      device_id: deviceId,
      topic,
      payload,
      status: 'failed',
    })
    return NextResponse.json({ error: `MQTT: ${message}` }, { status: 502 })
  }

  // Логируем успешную команду в аудит
  const { error } = await supabase.from('commands').insert({
    device_id: deviceId,
    topic,
    payload,
    status: 'sent',
  })
  if (error) console.log('[v0] command audit insert error:', error.message)

  return NextResponse.json({ ok: true, topic })
}
