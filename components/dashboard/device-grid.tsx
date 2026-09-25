'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { applyManualOrder, moveDeviceId } from '@/lib/device-order'
import { DeviceCard } from './device-card'
import type { SendCommand } from './device-controls'
import type { Device, Telemetry } from '@/lib/types'

type DeviceWithLatest = Device & { latest: Telemetry | null }

export function DeviceGrid({
  devices,
  onCommand,
  onReorder,
  isReordering,
}: {
  devices: DeviceWithLatest[]
  onCommand: SendCommand
  onReorder: (deviceIds: string[]) => Promise<void>
  /** Режим «Изменить порядок» */
  isReordering: boolean
}) {
  const [orderedDevices, setOrderedDevices] = useState(devices)
  const [isSavingOrder, setIsSavingOrder] = useState(false)

  useEffect(() => {
    if (isSavingOrder) return
    setOrderedDevices(devices)
  }, [devices, isSavingOrder])

  const handleMove = useCallback(
    async (deviceId: string, direction: -1 | 1) => {
      if (isSavingOrder) return
      const nextIds = moveDeviceId(
        orderedDevices.map((d) => d.device_id),
        deviceId,
        direction,
      )
      if (!nextIds) return

      setOrderedDevices(applyManualOrder(orderedDevices, nextIds))
      setIsSavingOrder(true)
      try {
        await onReorder(nextIds)
      } catch (e) {
        setOrderedDevices(devices)
        toast.error(e instanceof Error ? e.message : 'Не удалось сохранить порядок')
      } finally {
        setIsSavingOrder(false)
      }
    },
    [devices, isSavingOrder, onReorder, orderedDevices],
  )

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {orderedDevices.map((device, index) => (
        <div
          key={device.id}
          className={cn(
            isReordering &&
              'rounded-2xl outline-2 outline-offset-4 outline-dashed outline-primary/35',
          )}
        >
          <DeviceCard
            device={device}
            onCommand={onCommand}
            reorder={
              isReordering
                ? {
                    canMoveUp: index > 0,
                    canMoveDown: index < orderedDevices.length - 1,
                    disabled: isSavingOrder,
                    onMove: (direction) => void handleMove(device.device_id, direction),
                  }
                : undefined
            }
          />
        </div>
      ))}
    </div>
  )
}
