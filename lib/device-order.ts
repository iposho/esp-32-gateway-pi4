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
