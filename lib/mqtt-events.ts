export type MqttEventType =
  | 'status'
  | 'telemetry'
  | 'capabilities'
  | 'command'
  | 'out'
  | 'other'

export type MqttEvent = {
  id: number
  device_id: string | null
  topic: string
  event_type: MqttEventType
  payload: Record<string, unknown>
  payload_size: number
  created_at: string
}

export const MQTT_EVENT_TYPES: MqttEventType[] = [
  'status',
  'telemetry',
  'capabilities',
  'command',
  'out',
  'other',
]

export const EVENT_TYPE_LABELS: Record<MqttEventType, string> = {
  status: 'Status',
  telemetry: 'Telemetry',
  capabilities: 'Capabilities',
  command: 'Command',
  out: 'Out',
  other: 'Other',
}

export function parseEventType(topic: string): MqttEventType {
  const parts = topic.split('/')
  if (parts.length < 3 || parts[0] !== 'devices') return 'other'

  const segment = parts[2]
  if (
    segment === 'status' ||
    segment === 'telemetry' ||
    segment === 'command' ||
    segment === 'capabilities'
  ) {
    return segment
  }
  if (segment === 'out') return 'out'
  return 'other'
}

export function parseDeviceId(topic: string): string | null {
  const parts = topic.split('/')
  if (parts.length >= 2 && parts[0] === 'devices' && parts[1]) {
    return parts[1]
  }
  return null
}
