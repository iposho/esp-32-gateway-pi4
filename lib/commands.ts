/** MQTT-топик команд для устройства */
export function commandTopic(deviceId: string): string {
  return `devices/${deviceId}/command`
}

export type CommandRef = {
  action: string
  title: string
  payload: string
  description: string
}

/** Справочник поддерживаемых команд (прошивка esp32-example.ino и совместимые) */
export const COMMAND_REFERENCE: CommandRef[] = [
  {
    action: 'led',
    title: 'Светодиод',
    payload: '{ "action": "led", "value": true }',
    description: 'Вкл/выкл LED_BUILTIN. value: true | false',
  },
  {
    action: 'reboot',
    title: 'Перезагрузка',
    payload: '{ "action": "reboot" }',
    description: 'Перезапуск ESP32 (ESP.restart)',
  },
  {
    action: 'relay',
    title: 'Реле',
    payload: '{ "action": "relay", "value": true }',
    description: 'Пример: GPIO2. value: true | false',
  },
]

export const MQTT_TOPICS = [
  {
    topic: 'devices/<id>/status',
    direction: 'ESP32 → брокер',
    payload: '{ "status": "online" }',
    note: 'Retained + LWT offline при обрыве',
  },
  {
    topic: 'devices/<id>/telemetry',
    direction: 'ESP32 → брокер',
    payload: '{ "uptime": 120, "rssi": -55, "heap": 40000 }',
    note: 'Произвольный JSON с метриками',
  },
  {
    topic: 'devices/<id>/command',
    direction: 'Админка → ESP32',
    payload: '{ "action": "led", "value": true }',
    note: 'QoS 1, без retain',
  },
] as const
