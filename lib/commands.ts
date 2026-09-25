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
  Sun,
  Thermometer,
  type LucideIcon,
} from "lucide-react";
import type { CommandDef } from "@/lib/types";

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
  sun: Sun,
  thermometer: Thermometer,
};

/** Получить компонент иконки по строковому идентификатору из скетча */
export function getCommandIcon(icon?: string): LucideIcon {
  if (!icon) return FALLBACK_ICON;
  return ICON_MAP[icon] ?? FALLBACK_ICON;
}

/**
 * Опасные команды (перезагрузка, сброс, прошивка) не показываем среди
 * обычного управления — только в «Обслуживании» и с подтверждением.
 */
export function isDangerousCommand(cmd: CommandDef): boolean {
  return /reboot|restart|reset|format|erase|ota/i.test(cmd.action);
}

function parseBool(raw: unknown): boolean | undefined {
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number") return raw !== 0;
  if (typeof raw === "string") {
    const l = raw.toLowerCase().trim();
    if (l === "true" || l === "1" || l === "on") return true;
    if (l === "false" || l === "0" || l === "off") return false;
  }
  return undefined;
}

/**
 * Текущее состояние toggle-команды из телеметрии: сначала ключ, равный action,
 * затем похожий (led ↔ board_led и т.п.).
 */
export function getToggleState(
  payload: Record<string, unknown> | undefined,
  action: string,
): boolean | undefined {
  if (!payload) return undefined;
  const direct = parseBool(payload[action]);
  if (direct !== undefined) return direct;

  const act = action.toLowerCase();
  for (const [key, val] of Object.entries(payload)) {
    const k = key.toLowerCase();
    if (k === act || k.endsWith(`_${act}`) || act.endsWith(`_${k}`)) {
      const parsed = parseBool(val);
      if (parsed !== undefined) return parsed;
    }
  }
  return undefined;
}

/** Текущее значение range-команды из телеметрии */
export function getRangeState(
  payload: Record<string, unknown> | undefined,
  action: string,
): number | undefined {
  const raw = Number(payload?.[action]);
  return Number.isFinite(raw) ? raw : undefined;
}

export function getRangeBounds(cmd: CommandDef) {
  const min = Number.isFinite(cmd.min) ? (cmd.min as number) : 0;
  const max = Number.isFinite(cmd.max) ? (cmd.max as number) : 100;
  const step = Number(cmd.step) > 0 ? (cmd.step as number) : 1;
  return { min, max, step };
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
