/** MQTT-топик команд для устройства */
export function commandTopic(deviceId: string): string {
  return `devices/${deviceId}/command`;
}

/** MQTT-топик описания возможностей */
export function capabilitiesTopic(deviceId: string): string {
  return `devices/${deviceId}/capabilities`;
}

export type CommandRef = {
  action: string;
  title: string;
  payload: string;
  description: string;
};

import {
  Lightbulb,
  RotateCw,
  RefreshCw,
  Zap,
  Send,
  Camera,
  Power,
  Fan,
  Bell,
  Circle,
  type LucideIcon,
} from "lucide-react";

const FALLBACK_ICON = Zap;

const ICON_MAP: Record<string, LucideIcon> = {
  lightbulb: Lightbulb,
  "rotate-cw": RotateCw,
  "refresh-cw": RefreshCw,
  zap: Zap,
  send: Send,
  camera: Camera,
  power: Power,
  fan: Fan,
  bell: Bell,
  circle: Circle,
  dot: Circle,
};

/** Получить компонент иконки по строковому идентификатору из скетча */
export function getCommandIcon(icon?: string): LucideIcon {
  if (!icon) return FALLBACK_ICON;
  return ICON_MAP[icon] ?? FALLBACK_ICON;
}

/** Справочник поддерживаемых команд (прошивка esp32-example.ino и совместимые) */
export const COMMAND_REFERENCE: CommandRef[] = [
  {
    action: "led",
    title: "Светодиод",
    payload: '{ "action": "led", "value": true }',
    description: "Вкл/выкл LED_BUILTIN. value: true | false",
  },
  {
    action: "reboot",
    title: "Перезагрузка",
    payload: '{ "action": "reboot" }',
    description: "Перезапуск ESP32 (ESP.restart)",
  },
  {
    action: "relay",
    title: "Реле",
    payload: '{ "action": "relay", "value": true }',
    description: "Пример: GPIO2. value: true | false",
  },
];

export const MQTT_TOPICS = [
  {
    topic: "devices/<id>/status",
    direction: "ESP32 → брокер",
    payload: '{ "status": "online" }',
    note: "Retained + LWT offline при обрыве",
  },
  {
    topic: "devices/<id>/telemetry",
    direction: "ESP32 → брокер",
    payload: '{ "uptime": 120, "rssi": -55, "heap": 40000 }',
    note: "Произвольный JSON с метриками",
  },
  {
    topic: "devices/<id>/command",
    direction: "Админка → ESP32",
    payload: '{ "action": "led", "value": true }',
    note: "QoS 1, без retain",
  },
  {
    topic: "devices/<id>/capabilities",
    direction: "ESP32 → брокер",
    payload:
      '{ "commands": [...], "metrics": [...], "dashboard": { "summary": ["ip","rssi"], "max_items": 4 } }',
    note: "Retained. Команды и схема метрик для UI",
  },
] as const;
