'use client'

import { useCallback } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import {
  Cpu,
  LogOut,
  RefreshCw,
  Radio,
  Wifi,
  WifiOff,
  Activity,
} from 'lucide-react'
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

  const rawDevices = data?.devices ?? []
  const devices = [...rawDevices].sort((a, b) => {
    if (a.is_online === b.is_online) return 0
    return a.is_online ? -1 : 1
  })
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

  const deleteDevice = useCallback(
    async (deviceId: string) => {
      const res = await fetch(`/api/devices/${deviceId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? 'Ошибка при удалении')
      }
      // Revalidate cache
      mutate()
    },
    [mutate]
  )

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.replace('/')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-background">
      {/* ── Sticky header ── */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <Cpu className="size-4" />
            </div>
            <div>
              <h1 className="text-sm font-semibold leading-tight text-foreground">ESP32 Gateway</h1>
              <p className="text-[11px] text-muted-foreground">esp32.kuzyak.in</p>
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

      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-6">
        {/* ── Stats row ── */}
        <div className="mb-6 grid grid-cols-3 gap-3">
          <StatCard
            icon={<Radio className="size-4" />}
            label="Всего"
            value={devices.length}
            color="default"
          />
          <StatCard
            icon={<Wifi className="size-4" />}
            label="Онлайн"
            value={online}
            color="online"
          />
          <StatCard
            icon={<WifiOff className="size-4" />}
            label="Оффлайн"
            value={devices.length - online}
            color="offline"
          />
        </div>

        {/* ── Error ── */}
        {error && (
          <Card className="mb-6 border-destructive/20 bg-destructive/5">
            <CardContent className="py-3 px-4 text-sm text-destructive flex items-center gap-2">
              <Activity className="size-4 shrink-0" />
              Не удалось загрузить устройства. Проверьте подключение к Supabase.
            </CardContent>
          </Card>
        )}

        {/* ── Devices grid ── */}
        {isLoading && devices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <RefreshCw className="size-5 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Загрузка списка устройств...</span>
          </div>
        ) : devices.length === 0 ? (
          <Card className="border-dashed bg-transparent shadow-none">
            <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                <Radio className="size-5 text-muted-foreground" />
              </div>
              <h3 className="font-semibold text-foreground">Устройств пока нет</h3>
              <p className="max-w-sm text-sm text-muted-foreground text-balance">
                Как только ESP32 отправит сообщение в MQTT, Node-RED создаст запись,
                и устройство появится здесь.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {devices.map((d) => (
              <DeviceCard key={d.id} device={d} onCommand={sendCommand} onDelete={deleteDevice} />
            ))}
          </div>
        )}

        {/* ── Commands reference ── */}
        <div className="mt-10">
          <CommandsReference />
        </div>
      </main>
    </div>
  )
}

/* ── Stat Card ── */
function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode
  label: string
  value: number
  color: 'default' | 'online' | 'offline'
}) {
  const colorStyles = {
    default: 'text-muted-foreground',
    online: 'text-emerald-600 dark:text-emerald-400',
    offline: 'text-muted-foreground/60',
  }

  const iconBgStyles = {
    default: 'bg-muted text-muted-foreground',
    online: 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-400',
    offline: 'bg-muted text-muted-foreground/60',
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${iconBgStyles[color]}`}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider truncate">
            {label}
          </p>
          <p className={`text-2xl font-bold tracking-tight tabular-nums ${colorStyles[color]}`}>
            {value}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
