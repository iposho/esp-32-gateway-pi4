import type { Telemetry } from './types'

export const CAMERA_TELEMETRY_KEYS = [
  'last_photo_url',
  'camera_ready',
  'capture_count',
] as const

export type CameraTelemetryKey = (typeof CAMERA_TELEMETRY_KEYS)[number]

/** Последняя запись телеметрии по каждому устройству (rows уже отсортированы по убыванию created_at). */
export function indexLatestPerDevice(rows: Telemetry[]): Record<string, Telemetry> {
  const latest: Record<string, Telemetry> = {}
  for (const row of rows) {
    if (!latest[row.device_id]) latest[row.device_id] = row
  }
  return latest
}

/** Собирает последние известные поля камеры из истории телеметрии. */
export function extractCameraFields(
  rows: Telemetry[],
): Partial<Record<CameraTelemetryKey, unknown>> {
  const result: Partial<Record<CameraTelemetryKey, unknown>> = {}

  for (const row of rows) {
    const payload = row.payload
    for (const key of CAMERA_TELEMETRY_KEYS) {
      if (result[key] !== undefined) continue
      const value = payload[key]
      if (value === undefined || value === null || value === '') continue
      result[key] = value
    }

    if (
      result.last_photo_url !== undefined &&
      result.camera_ready !== undefined &&
      result.capture_count !== undefined
    ) {
      break
    }
  }

  return result
}

export function mergeCameraFieldsIntoTelemetry(
  latest: Telemetry | null,
  cameraFields: Partial<Record<CameraTelemetryKey, unknown>>,
): Telemetry | null {
  if (!latest || Object.keys(cameraFields).length === 0) return latest

  return {
    ...latest,
    payload: { ...latest.payload, ...cameraFields },
  }
}

/** Дедупликация строк телеметрии по id с сортировкой от новых к старым. */
export function mergeTelemetryRows(...groups: Array<Telemetry[] | null | undefined>): Telemetry[] {
  const byId = new Map<number, Telemetry>()
  for (const group of groups) {
    for (const row of group ?? []) {
      byId.set(row.id, row)
    }
  }

  return [...byId.values()].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )
}

export function groupTelemetryByDevice(rows: Telemetry[]): Record<string, Telemetry[]> {
  const grouped: Record<string, Telemetry[]> = {}
  for (const row of rows) {
    ;(grouped[row.device_id] ??= []).push(row)
  }
  return grouped
}
