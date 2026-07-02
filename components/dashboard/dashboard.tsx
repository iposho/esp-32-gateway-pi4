'use client'

import { useCallback } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import { Cpu, LogOut, RefreshCw, Radio, Wifi, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { DeviceCard } from './device-card'
import { CommandsReference } from './commands-reference'
import type { Device, Telemetry } from '@/lib/types'

type DeviceWithLatest = Device & { latest: Telemetry | null }

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function Dashboard() {
  const router = useRouter()
  const { data, error, isLoading, mutate } = useSWR<{ devices: DeviceWithLatest[] }>(
    '/api/devices',
    fetcher,
    { refreshInterval: 3000, keepPreviousData: true },
  )

  const devices = data?.devices ?? []
  const online = devices.filter((d) => d.is_online).length

  const sendCommand = useCallback(
    async (deviceId: string, payload: Record<string, unknown>) => {
      const res = await fetch('/api/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, payload }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? 'Ошибка')
      }
    },
    [],
  )

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.replace('/')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Cpu className="size-5" />
            </div>
            <div>
              <h1 className="font-semibold leading-tight">ESP32 Gateway</h1>
              <p className="text-xs text-muted-foreground">esp32.kuzyak.in</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => mutate()}>
              <RefreshCw className={`size-4 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Обновить</span>
            </Button>
            <Button variant="outline" size="sm" onClick={logout}>
              <LogOut className="size-4" />
              <span className="hidden sm:inline">Выход</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {/* Сводка */}
        <div className="mb-6 grid grid-cols-3 gap-3">
          <StatCard
            icon={<Radio className="size-4" />}
            label="Всего устройств"
            value={devices.length}
          />
          <StatCard
            icon={<Wifi className="size-4 text-online" />}
            label="Онлайн"
            value={online}
          />
          <StatCard
            icon={<WifiOff className="size-4 text-offline" />}
            label="Оффлайн"
            value={devices.length - online}
          />
        </div>

        <CommandsReference />

        {error && (
          <Card className="mb-6 border-destructive/40">
            <CardContent className="py-4 text-sm text-destructive">
              Не удалось загрузить устройства. Проверьте подключение к Supabase
              (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).
            </CardContent>
          </Card>
        )}

        {isLoading && devices.length === 0 ? (
          <p className="text-sm text-muted-foreground">Загрузка…</p>
        ) : devices.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
              <Radio className="size-8 text-muted-foreground" />
              <p className="font-medium">Устройств пока нет</p>
              <p className="max-w-sm text-sm text-muted-foreground text-balance">
                Как только ESP32 отправит сообщение в MQTT, Node-RED создаст запись
                в Supabase и устройство появится здесь.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {devices.map((d) => (
              <DeviceCard key={d.id} device={d} onCommand={sendCommand} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: number
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 p-4">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {icon}
          <span className="truncate">{label}</span>
        </div>
        <span className="text-2xl font-semibold tabular-nums">{value}</span>
      </CardContent>
    </Card>
  )
}
