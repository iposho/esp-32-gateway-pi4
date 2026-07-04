'use client'

import { useCallback } from 'react'
import useSWR from 'swr'
import { useRouter, useParams } from 'next/navigation'
import { LogOut, RefreshCw, Activity } from 'lucide-react'
import { BrandLogo } from '@/components/brand-logo'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { DeviceDetailView } from '@/components/dashboard/device-detail-view'
import type { Device, Telemetry } from '@/lib/types'

type DeviceWithLatest = Device & { latest: Telemetry | null }

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function DeviceDetailPage() {
  const router = useRouter()
  const params = useParams<{ deviceId: string }>()
  const deviceId = decodeURIComponent(params.deviceId)

  const { data, error, isLoading, mutate } = useSWR<{ device: DeviceWithLatest }>(
    deviceId ? `/api/devices/${encodeURIComponent(deviceId)}` : null,
    fetcher,
    { refreshInterval: 3000, keepPreviousData: true },
  )

  const device = data?.device

  const sendCommand = useCallback(
    async (id: string, payload: Record<string, unknown>) => {
      const res = await fetch('/api/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: id, payload }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? 'Ошибка')
      }
      await mutate()
    },
    [mutate],
  )

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
          current?.device
            ? { device: { ...current.device, name } }
            : current,
        { revalidate: true },
      )
    },
    [mutate],
  )

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.replace('/')
    router.refresh()
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-background/70 backdrop-blur-2xl supports-[backdrop-filter]:bg-background/55">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <BrandLogo size={36} />
            <div>
              <h1 className="text-base font-semibold leading-tight text-foreground">
                ESP32 Gateway
              </h1>
              <p className="text-xs text-muted-foreground">esp32.kuzyak.in</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => mutate()}
              className="text-muted-foreground hover:text-foreground"
            >
              <RefreshCw className={`size-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Обновить</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={logout}
              className="text-muted-foreground hover:text-foreground"
            >
              <LogOut className="size-3.5" />
              <span className="hidden sm:inline">Выход</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-8">
        {error && (
          <Card className="mb-6 border-destructive/20 bg-destructive/10">
            <CardContent className="flex items-center gap-2 px-4 py-3 text-sm text-destructive">
              <Activity className="size-4 shrink-0" />
              Не удалось загрузить устройство.
            </CardContent>
          </Card>
        )}

        {isLoading && !device ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <RefreshCw className="size-5 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Загрузка...</span>
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
                <Button variant="outline" size="sm" onClick={() => router.push('/dashboard')}>
                  Вернуться к списку
                </Button>
              </CardContent>
            </Card>
          )
        )}
      </main>
    </div>
  )
}
