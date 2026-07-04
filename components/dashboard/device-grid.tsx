'use client'

import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, GripVertical } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  applyManualOrder,
  moveDeviceId,
  reorderDeviceIds,
} from '@/lib/device-order'
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

  const persistOrder = useCallback(
    async (nextIds: string[]) => {
      const currentIds = orderedDevices.map((d) => d.device_id)
      if (nextIds.join('|') === currentIds.join('|')) return

      const nextDevices = applyManualOrder(orderedDevices, nextIds)
      setOrderedDevices(nextDevices)
      setIsSavingOrder(true)

      try {
        await onReorder(nextIds)
      } catch (e) {
        setOrderedDevices(devices)
        toast.error(e instanceof Error ? e.message : 'Не удалось сохранить порядок')
      } finally {
        setIsSavingOrder(false)
        setDraggedId(null)
        setOverId(null)
      }
    },
    [devices, onReorder, orderedDevices],
  )

  async function handleDrop(targetId: string) {
    if (!draggedId || draggedId === targetId || isSavingOrder) return

    const currentIds = orderedDevices.map((d) => d.device_id)
    const nextIds = reorderDeviceIds(currentIds, draggedId, targetId)
    await persistOrder(nextIds)
  }

  async function handleMove(deviceId: string, direction: -1 | 1) {
    if (isSavingOrder) return

    const currentIds = orderedDevices.map((d) => d.device_id)
    const nextIds = moveDeviceId(currentIds, deviceId, direction)
    if (!nextIds) return

    await persistOrder(nextIds)
  }

  return (
    <div
      className={cn(
        'grid gap-4 md:grid-cols-2 xl:grid-cols-3',
        isSavingOrder && 'pointer-events-none opacity-90',
      )}
    >
      {orderedDevices.map((device, index) => {
        const isDragging = draggedId === device.device_id
        const isDropTarget =
          overId === device.device_id &&
          draggedId !== null &&
          draggedId !== device.device_id
        const canMoveUp = index > 0
        const canMoveDown = index < orderedDevices.length - 1

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

            {/* Drag handle — desktop */}
            <div
              role="button"
              tabIndex={0}
              draggable={!isSavingOrder}
              aria-label="Перетащить устройство"
              title="Перетащите для изменения порядка"
              className={cn(
                'absolute left-2 top-2 z-30 hidden size-8 cursor-grab touch-none select-none items-center justify-center rounded-lg border border-border/70 bg-background/90 text-muted-foreground shadow-sm backdrop-blur-sm transition-colors hover:text-foreground active:cursor-grabbing md:flex',
                isSavingOrder && 'cursor-not-allowed opacity-50',
              )}
              onDragStart={(e) => {
                e.stopPropagation()
                e.dataTransfer.setData('text/plain', device.device_id)
                e.dataTransfer.effectAllowed = 'move'
                setDraggedId(device.device_id)
              }}
              onDragEnd={() => {
                setDraggedId(null)
                setOverId(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowUp' && canMoveUp) {
                  e.preventDefault()
                  void handleMove(device.device_id, -1)
                }
                if (e.key === 'ArrowDown' && canMoveDown) {
                  e.preventDefault()
                  void handleMove(device.device_id, 1)
                }
              }}
            >
              <GripVertical className="size-4" />
            </div>

            {/* Reorder — mobile (HTML5 DnD не работает на touch) */}
            <div className="absolute left-2 top-2 z-30 flex flex-col overflow-hidden rounded-lg border border-border/70 bg-background/90 shadow-sm backdrop-blur-sm md:hidden">
              <button
                type="button"
                aria-label="Переместить выше"
                disabled={!canMoveUp || isSavingOrder}
                className="flex size-8 items-center justify-center text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:opacity-30"
                onClick={() => void handleMove(device.device_id, -1)}
              >
                <ChevronUp className="size-4" />
              </button>
              <div className="h-px bg-border/70" />
              <button
                type="button"
                aria-label="Переместить ниже"
                disabled={!canMoveDown || isSavingOrder}
                className="flex size-8 items-center justify-center text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:opacity-30"
                onClick={() => void handleMove(device.device_id, 1)}
              >
                <ChevronDown className="size-4" />
              </button>
            </div>

            <DeviceCard
              device={device}
              onDelete={onDelete}
              onRename={onRename}
              hasReorderControls
            />
          </div>
        )
      })}
    </div>
  )
}
