import type { Device } from '@/lib/types'

export function getDeviceSortOrder(device: Device): number {
  const order = device.metadata?.sort_order
  return typeof order === 'number' && Number.isFinite(order)
    ? order
    : Number.MAX_SAFE_INTEGER
}

export function sortDevices<T extends Device>(devices: T[]): T[] {
  return [...devices].sort((a, b) => {
    if (a.is_online !== b.is_online) {
      return a.is_online ? -1 : 1
    }

    const orderDiff = getDeviceSortOrder(a) - getDeviceSortOrder(b)
    if (orderDiff !== 0) return orderDiff
    return a.name.localeCompare(b.name, 'ru')
  })
}

export function reorderDeviceIds(
  deviceIds: string[],
  fromId: string,
  toId: string,
): string[] {
  const fromIndex = deviceIds.indexOf(fromId)
  const toIndex = deviceIds.indexOf(toId)
  if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
    return deviceIds
  }

  const next = [...deviceIds]
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)
  return next
}

export function applyManualOrder<T extends Device>(
  devices: T[],
  deviceIds: string[],
): T[] {
  const byId = new Map(devices.map((d) => [d.device_id, d]))
  const list: T[] = []

  for (const id of deviceIds) {
    const device = byId.get(id)
    if (device) {
      list.push({
        ...device,
        metadata: { ...device.metadata, sort_order: list.length },
      })
    }
  }
  return list
}

export function moveDeviceId(
  deviceIds: string[],
  deviceId: string,
  direction: -1 | 1,
): string[] | null {
  const index = deviceIds.indexOf(deviceId)
  const newIndex = index + direction
  if (index === -1 || newIndex < 0 || newIndex >= deviceIds.length) {
    return null
  }

  const next = [...deviceIds]
  const [moved] = next.splice(index, 1)
  next.splice(newIndex, 0, moved)
  return next
}
