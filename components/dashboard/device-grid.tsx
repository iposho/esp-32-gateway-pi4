'use client'

import { useEffect, useState } from 'react'
import { GripVertical } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { reorderDeviceIds, sortDevices } from '@/lib/device-order'
import { DeviceCard } from './device-card'
import type { Device, Telemetry } from '@/lib/types'

type DeviceWithLatest = Device & { latest: Telemetry | null }

export function DeviceGrid({
  devices,
  onDelete,
  onRename,
  onReorder,
}: {
  devices: DeviceWithLatest[]
  onDelete?: (deviceId: string) => Promise<void>
  onRename?: (deviceId: string, name: string) => Promise<void>
  onReorder: (deviceIds: string[]) => Promise<void>
}) {
  const [orderedDevices, setOrderedDevices] = useState(devices)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const [isSavingOrder, setIsSavingOrder] = useState(false)

  useEffect(() => {
    if (draggedId || isSavingOrder) return
    setOrderedDevices(devices)
  }, [devices, draggedId, isSavingOrder])

  async function handleDrop(targetId: string) {
    if (!draggedId || draggedId === targetId || isSavingOrder) return

    const currentIds = orderedDevices.map((d) => d.device_id)
    const nextIds = reorderDeviceIds(currentIds, draggedId, targetId)
    if (nextIds.join('|') === currentIds.join('|')) return

    const byId = new Map(orderedDevices.map((d) => [d.device_id, d]))
    const reordered = nextIds
      .map((id) => byId.get(id))
      .filter((d): d is DeviceWithLatest => Boolean(d))
    const nextDevices = sortDevices(reordered)
    const sortedIds = nextDevices.map((d) => d.device_id)

    setOrderedDevices(nextDevices)
    setIsSavingOrder(true)

    try {
      await onReorder(sortedIds)
    } catch (e) {
      setOrderedDevices(devices)
      toast.error(e instanceof Error ? e.message : 'Не удалось сохранить порядок')
    } finally {
      setIsSavingOrder(false)
      setDraggedId(null)
      setOverId(null)
    }
  }

  return (
    <div
      className={cn(
        'grid gap-4 md:grid-cols-2 xl:grid-cols-3',
        isSavingOrder && 'pointer-events-none opacity-90',
      )}
    >
      {orderedDevices.map((device) => {
        const isDragging = draggedId === device.device_id
        const isDropTarget =
          overId === device.device_id &&
          draggedId !== null &&
          draggedId !== device.device_id

        return (
          <div
            key={device.id}
            className={cn(
              'relative transition-[transform,opacity,box-shadow] duration-200',
              isDragging && 'scale-[0.985] opacity-45',
              isDropTarget && 'z-10',
            )}
            onDragOver={(e) => {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              setOverId(device.device_id)
            }}
            onDragLeave={(e) => {
              if (e.currentTarget.contains(e.relatedTarget as Node)) return
              setOverId((current) =>
                current === device.device_id ? null : current,
              )
            }}
            onDrop={(e) => {
              e.preventDefault()
              void handleDrop(device.device_id)
            }}
          >
            {isDropTarget && (
              <div className="pointer-events-none absolute inset-0 z-20 rounded-2xl ring-2 ring-primary ring-offset-2 ring-offset-background" />
            )}

            <DeviceCard
              device={device}
              onDelete={onDelete}
              onRename={onRename}
              dragHandle={
                <button
                  type="button"
                  draggable
                  disabled={isSavingOrder}
                  aria-label="Перетащить устройство"
                  title="Перетащите для изменения порядка"
                  className={cn(
                    'absolute left-2 top-2 z-20 flex size-7 cursor-grab items-center justify-center rounded-lg border border-border/70 bg-background/85 text-muted-foreground shadow-sm backdrop-blur-sm transition-colors hover:text-foreground active:cursor-grabbing',
                    isSavingOrder && 'cursor-not-allowed opacity-50',
                  )}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', device.device_id)
                    e.dataTransfer.effectAllowed = 'move'
                    setDraggedId(device.device_id)
                  }}
                  onDragEnd={() => {
                    setDraggedId(null)
                    setOverId(null)
                  }}
                >
                  <GripVertical className="size-3.5" />
                </button>
              }
            />
          </div>
        )
      })}
    </div>
  )
}
