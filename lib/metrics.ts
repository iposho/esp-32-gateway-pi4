import {
  Activity,
  Battery,
  Clock,
  Cpu,
  Droplets,
  Gauge,
  Globe,
  MemoryStick,
  Signal,
  Thermometer,
  Wifi,
  type LucideIcon,
} from 'lucide-react'
import { formatValue, labelForKey } from '@/lib/format'
import type { DeviceMetadata, MetricDef, MetricFormat } from '@/lib/types'

const FALLBACK_ICON = Gauge

const METRIC_ICON_MAP: Record<string, LucideIcon> = {
  activity: Activity,
  battery: Battery,
  clock: Clock,
  cpu: Cpu,
  droplets: Droplets,
  gauge: Gauge,
  globe: Globe,
  memory: MemoryStick,
  'memory-stick': MemoryStick,
  signal: Signal,
  thermometer: Thermometer,
  wifi: Wifi,
}

/** Служебные ключи payload — не показываем как метрики пользователю */
export const SERVICE_TELEMETRY_KEYS = new Set([
  'last_photo_url',
  'ota',
  'progress',
  'camera_ready',
  'pin_error',
  'pin_status',
  'fs_ls',
  'fs_file',
  'content',
  'capture_count',
])

export function isServiceTelemetryKey(key: string): boolean {
  const normalized = key.toLowerCase()
  return (
    SERVICE_TELEMETRY_KEYS.has(normalized) ||
    normalized.startsWith('pin_') ||
    normalized.startsWith('fs_')
  )
}

export function getMetricIcon(icon?: string): LucideIcon {
  if (!icon) return FALLBACK_ICON
  return METRIC_ICON_MAP[icon] ?? FALLBACK_ICON
}

export type ResolvedMetric = {
  def: MetricDef
  value: unknown
  resolvedKey: string
  label: string
  formatted: string
  icon: LucideIcon
}

export function getPayloadValue(
  payload: Record<string, unknown>,
  keys: string | string[],
): { value: unknown; key: string } | null {
  const keyList = Array.isArray(keys) ? keys : [keys]

  for (const key of keyList) {
    if (payload[key] !== undefined && payload[key] !== null) {
      return { value: payload[key], key }
    }
    const found = Object.entries(payload).find(
      ([k]) => k.toLowerCase() === key.toLowerCase(),
    )
    if (found) return { value: found[1], key: found[0] }
  }

  return null
}

function formatMetricValue(
  value: unknown,
  key: string,
  format?: MetricFormat,
  unit?: string,
): string {
  if (value === null || value === undefined) return '—'

  if (format === 'boolean' || typeof value === 'boolean') {
    return value ? 'Да' : 'Нет'
  }

  if (format === 'text' || typeof value === 'string') {
    return String(value)
  }

  const formatted = formatValue(value, key)

  if (unit && formatted !== '—' && !formatted.includes(unit)) {
    return `${formatted} ${unit}`
  }

  return formatted
}

function resolveMetricLabel(def: MetricDef, resolvedKey: string): string {
  return def.label ?? labelForKey(resolvedKey)
}

/** Разрешает метрики из декларации прошивки + значения из payload */
export function resolveMetrics(
  defs: MetricDef[],
  payload: Record<string, unknown>,
): ResolvedMetric[] {
  return defs
    .filter((def) => !def.hidden)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((def) => {
      const keys = def.keys ?? [def.key]
      const found = getPayloadValue(payload, keys)
      const resolvedKey = found?.key ?? def.key

      return {
        def,
        value: found?.value,
        resolvedKey,
        label: resolveMetricLabel(def, resolvedKey),
        formatted: formatMetricValue(found?.value, resolvedKey, def.format, def.unit),
        icon: getMetricIcon(def.icon),
      }
    })
}

/** Метрики для компактной карточки на дашборде */
export function getDashboardMetrics(
  metadata: DeviceMetadata,
  payload: Record<string, unknown>,
): ResolvedMetric[] {
  const defs = metadata.metrics ?? []
  if (defs.length === 0) return getFallbackDashboardMetrics(payload)

  const dashboardKeys = metadata.dashboard?.summary
  const filtered = dashboardKeys?.length
    ? defs.filter((d) => dashboardKeys.includes(d.key))
    : defs.filter((d) => d.dashboard)

  const resolved = resolveMetrics(filtered, payload)
  return resolved.slice(0, metadata.dashboard?.max_items ?? 4)
}

/** Метрики для страницы устройства, сгруппированные по секциям */
export function getDetailMetricGroups(
  metadata: DeviceMetadata,
  payload: Record<string, unknown>,
): { group: string; metrics: ResolvedMetric[] }[] {
  const defs = metadata.metrics ?? []
  const resolved =
    defs.length > 0
      ? resolveMetrics(defs, payload)
      : getFallbackDetailMetrics(payload)

  const groups = new Map<string, ResolvedMetric[]>()

  for (const metric of resolved) {
    const group = metric.def.group ?? 'Телеметрия'
    const list = groups.get(group) ?? []
    list.push(metric)
    groups.set(group, list)
  }

  return [...groups.entries()].map(([group, metrics]) => ({ group, metrics }))
}

const FALLBACK_DASHBOARD_DEFS: MetricDef[] = [
  { key: 'ip', label: 'IP', icon: 'globe', dashboard: true, order: 0 },
  { key: 'rssi', keys: ['rssi', 'wifi_rssi'], label: 'Сигнал', icon: 'signal', dashboard: true, order: 1 },
  { key: 'uptime', keys: ['uptime', 'uptime_s', 'uptime_sec'], label: 'Аптайм', icon: 'clock', dashboard: true, order: 2 },
  { key: 'heap', keys: ['free_heap', 'heap'], label: 'RAM', icon: 'memory', format: 'bytes', dashboard: true, order: 3 },
]

function getFallbackDashboardMetrics(payload: Record<string, unknown>): ResolvedMetric[] {
  return resolveMetrics(FALLBACK_DASHBOARD_DEFS, payload)
}

function getFallbackDetailMetrics(payload: Record<string, unknown>): ResolvedMetric[] {
  const entries = Object.entries(payload).filter(
    ([k]) => !isServiceTelemetryKey(k),
  )

  const defs: MetricDef[] = entries.map(([key], index) => ({
    key,
    order: index,
    group: 'Телеметрия',
  }))

  return resolveMetrics(defs, payload)
}

export function hasCameraMetrics(payload: Record<string, unknown>): boolean {
  return (
    payload.camera_ready !== undefined || payload.last_photo_url !== undefined
  )
}
