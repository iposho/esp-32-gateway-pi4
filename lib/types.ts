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

export type DeviceMetadata = Record<string, unknown> & {
  commands?: CommandDef[];
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
