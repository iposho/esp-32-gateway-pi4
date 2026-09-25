'use client'

import { useCallback } from 'react'
import useSWR from 'swr'
import { useRouter, useParams } from 'next/navigation'
import { RefreshCw, WifiOff } from 'lucide-react'
import { DashboardShell } from '@/components/dashboard/dashboard-shell'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { DeviceDetailView } from '@/components/dashboard/device-detail-view'
import { useCommandPolling } from './use-command-polling'
import type { Device, Telemetry } from '@/lib/types'

type DeviceWithLatest = Device & { latest: Telemetry | null }

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function DeviceDetailPage() {
  const router = useRouter()
  const params = useParams<{ deviceId: string }>()
  const deviceId = decodeURIComponent(params.deviceId)
  const key = deviceId ? `/api/devices/${encodeURIComponent(deviceId)}` : null

  const { refreshInterval, sendCommand } = useCommandPolling(key)
  const { data, error, isLoading, mutate } = useSWR<{ device: DeviceWithLatest }>(
    key,
    fetcher,
    { refreshInterval, keepPreviousData: true },
  )

  const device = data?.device

  const deleteDevice = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/devices/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? 'Ошибка при удалении')
      }
      router.replace('/dashboard')
    },
    [router],
  )

  const renameDevice = useCallback(
    async (id: string, name: string) => {
      const res = await fetch(`/api/devices/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? 'Ошибка переименования')
      }
      await mutate(
        (current) =>
          current?.device ? { device: { ...current.device, name } } : current,
        { revalidate: true },
      )
    },
    [mutate],
  )

  return (
    <DashboardShell>
      <main className="mx-auto max-w-3xl px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-8">
        {error && (
          <Card className="mb-6 border-destructive/20 bg-destructive/10">
            <CardContent className="flex items-center gap-2 px-4 py-3 text-sm text-destructive">
              <WifiOff className="size-4 shrink-0" />
              Не удалось загрузить устройство. Проверьте подключение к серверу.
            </CardContent>
          </Card>
        )}

        {isLoading && !device ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <RefreshCw className="size-5 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Загружаем…</span>
          </div>
        ) : device ? (
          <DeviceDetailView
            device={device}
            onCommand={sendCommand}
            onDelete={deleteDevice}
            onRename={renameDevice}
          />
        ) : (
          !isLoading && (
            <Card className="border-dashed bg-card/50 shadow-none">
              <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
                <h3 className="font-semibold text-foreground">Устройство не найдено</h3>
                <p className="text-sm text-muted-foreground">
                  Возможно, его удалили.
                </p>
                <Button variant="outline" size="sm" onClick={() => router.push('/dashboard')}>
                  К списку устройств
                </Button>
              </CardContent>
            </Card>
          )
        )}
      </main>
    </DashboardShell>
  )
}
