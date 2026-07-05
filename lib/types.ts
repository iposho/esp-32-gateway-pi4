export type Device = {
  id: string;
  device_id: string;
  name: string;
  description: string | null;
  last_seen: string | null;
  is_online: boolean;
  metadata: DeviceMetadata;
  created_at: string;
};

export type MetricFormat =
  | 'number'
  | 'boolean'
  | 'text'
  | 'bytes'
  | 'uptime'
  | 'temperature'
  | 'percent'
  | 'rssi';

export type MetricDef = {
  /** Ключ в payload телеметрии */
  key: string;
  /** Альтернативные ключи (alias), например rssi / wifi_rssi */
  keys?: string[];
  /** Человекочитаемая подпись; если нет — выводится из key */
  label?: string;
  /** Единица измерения для отображения */
  unit?: string;
  /** Иконка: globe, signal, clock, memory, thermometer, droplets, battery, cpu, wifi, gauge */
  icon?: string;
  /** Формат значения */
  format?: MetricFormat;
  /** Группа на странице устройства */
  group?: string;
  /** Показывать на компактной карточке дашборда */
  dashboard?: boolean;
  /** Порядок сортировки */
  order?: number;
  /** Скрыть из UI (служебное поле) */
  hidden?: boolean;
};

export type DashboardMetricsConfig = {
  /** Явный список key метрик для дашборда (приоритет над dashboard: true) */
  summary?: string[];
  /** Максимум метрик на карточке */
  max_items?: number;
};

export type DeviceFeatures = {
  /** Публиковать прогресс OTA в телеметрию (по умолчанию true для новых устройств) */
  ota_progress?: boolean;
};

export type DeviceMetadata = Record<string, unknown> & {
  commands?: CommandDef[];
  metrics?: MetricDef[];
  dashboard?: DashboardMetricsConfig;
  features?: DeviceFeatures;
  sort_order?: number;
};

export type CommandDef = {
  action: string;
  title: string;
  type: "toggle" | "trigger";
  icon?: string;
  description?: string;
};

export type Telemetry = {
  id: number;
  device_id: string;
  topic: string;
  payload: Record<string, unknown>;
  created_at: string;
};

export type Command = {
  id: number;
  device_id: string;
  topic: string;
  payload: Record<string, unknown>;
  status: string;
  created_at: string;
};

export type { MqttEvent, MqttEventType } from './mqtt-events';

/** Считаем устройство онлайн, если оно отметилось за последние N секунд */
export const ONLINE_THRESHOLD_MS = 60_000;

export function isDeviceOnline(lastSeen: string | null): boolean {
  if (!lastSeen) return false;
  return Date.now() - new Date(lastSeen).getTime() < ONLINE_THRESHOLD_MS;
}

/** Онлайн, если недавно был status или пришла телеметрия */
export function isDeviceActive(
  lastSeen: string | null,
  telemetryAt: string | null,
): boolean {
  return isDeviceOnline(lastSeen) || isDeviceOnline(telemetryAt);
}
