'use client'

import { useCallback, useState } from 'react'
import useSWR from 'swr'
import { ArrowUpDown, Check, Radio, RefreshCw, WifiOff } from 'lucide-react'
import { DashboardShell } from '@/components/dashboard/dashboard-shell'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { DeviceGrid } from './device-grid'
import { useCommandPolling } from './use-command-polling'
import { sortDevices } from '@/lib/device-order'
import type { Device, Telemetry } from '@/lib/types'

type DeviceWithLatest = Device & { latest: Telemetry | null }

const fetcher = (url: string) => fetch(url).then((r) => r.json())
const DEVICES_KEY = '/api/devices'

export function Dashboard() {
  const { refreshInterval, sendCommand } = useCommandPolling(DEVICES_KEY)
  const { data, error, isLoading, mutate } = useSWR<{ devices: DeviceWithLatest[] }>(
    DEVICES_KEY,
    fetcher,
    { refreshInterval, keepPreviousData: true },
  )
  const [isReordering, setIsReordering] = useState(false)

  const devices = sortDevices(data?.devices ?? [])
  const online = devices.filter((d) => d.is_online).length

  const reorderDevices = useCallback(
    async (deviceIds: string[]) => {
      await mutate(
        (current) => {
          if (!current) return current
          const byId = new Map(current.devices.map((d) => [d.device_id, d]))
          const ordered: DeviceWithLatest[] = []
          deviceIds.forEach((id, index) => {
            const device = byId.get(id)
            if (device) {
              ordered.push({ ...device, metadata: { ...device.metadata, sort_order: index } })
            }
          })
          for (const device of current.devices) {
            if (!deviceIds.includes(device.device_id)) ordered.push(device)
          }
          return { devices: ordered }
        },
        { revalidate: false },
      )

      const res = await fetch('/api/devices/order', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceIds }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? 'Ошибка сохранения порядка')
      }

      await mutate()
    },
    [mutate],
  )

  return (
    <DashboardShell>
      <main className="mx-auto max-w-7xl px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Устройства
            </h1>
            {devices.length > 0 && (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                <span
                  aria-hidden
                  className={
                    online > 0
                      ? 'size-2 rounded-full bg-emerald-500'
                      : 'size-2 rounded-full bg-muted-foreground/40'
                  }
                />
                {online === devices.length
                  ? `Все ${devices.length} в сети`
                  : `${online} из ${devices.length} в сети`}
              </p>
            )}
          </div>

          {devices.length > 1 && (
            <Button
              variant={isReordering ? 'default' : 'outline'}
              size="sm"
              className="h-9 px-3"
              onClick={() => setIsReordering((v) => !v)}
            >
              {isReordering ? <Check className="size-3.5" /> : <ArrowUpDown className="size-3.5" />}
              {isReordering ? 'Готово' : 'Изменить порядок'}
            </Button>
          )}
        </div>

        {isReordering && (
          <p className="mb-4 text-sm text-muted-foreground">
            Стрелками на карточках поменяйте порядок устройств. Он сохраняется сразу.
          </p>
        )}

        {error && (
          <Card className="mb-6 border-destructive/20 bg-destructive/10">
            <CardContent className="flex items-center gap-2 px-4 py-3 text-sm text-destructive">
              <WifiOff className="size-4 shrink-0" />
              Не удалось загрузить устройства. Проверьте подключение к серверу.
            </CardContent>
          </Card>
        )}

        {isLoading && devices.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <RefreshCw className="size-5 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Загружаем устройства…</span>
          </div>
        ) : devices.length === 0 ? (
          <Card className="border-dashed bg-card/50 shadow-none">
            <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                <Radio className="size-5 text-muted-foreground" />
              </div>
              <h3 className="font-semibold text-foreground">Устройств пока нет</h3>
              <p className="max-w-sm text-balance text-sm text-muted-foreground">
                Включите ESP32 — как только оно подключится к сети, устройство
                появится здесь автоматически.
              </p>
            </CardContent>
          </Card>
        ) : (
          <DeviceGrid
            devices={devices}
            onCommand={sendCommand}
            onReorder={reorderDevices}
            isReordering={isReordering}
          />
        )}
      </main>
    </DashboardShell>
  )
}
