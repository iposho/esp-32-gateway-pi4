'use client'

import { useCallback } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import {
  LogOut,
  RefreshCw,
  Radio,
  Wifi,
  WifiOff,
  Activity,
} from 'lucide-react'
import { BrandLogo } from '@/components/brand-logo'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { DeviceGrid } from './device-grid'
import { CommandsReference } from './commands-reference'
import { sortDevices } from '@/lib/device-order'
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
  const devices = sortDevices(rawDevices)
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

  const renameDevice = useCallback(
    async (deviceId: string, name: string) => {
      const res = await fetch(`/api/devices/${deviceId}`, {
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
          current
            ? {
                devices: current.devices.map((d) =>
                  d.device_id === deviceId ? { ...d, name } : d,
                ),
              }
            : current,
        { revalidate: true },
      )
    },
    [mutate],
  )

  const reorderDevices = useCallback(
    async (deviceIds: string[]) => {
      await mutate(
        (current) => {
          if (!current) return current

          const byId = new Map(current.devices.map((d) => [d.device_id, d]))
          const ordered = deviceIds
            .map((id, index) => {
              const device = byId.get(id)
              if (!device) return null
              return {
                ...device,
                metadata: { ...device.metadata, sort_order: index },
              }
            })
            .filter((d): d is DeviceWithLatest => Boolean(d))

          for (const device of current.devices) {
            if (!deviceIds.includes(device.device_id)) {
              ordered.push(device)
            }
          }

          return { devices: sortDevices(ordered) }
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

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.replace('/')
    router.refresh()
  }

  return (
    <div className="min-h-screen">
      {/* ── Sticky header ── */}
      <header className="sticky top-0 z-10 border-b border-white/10 bg-background/70 backdrop-blur-2xl supports-[backdrop-filter]:bg-background/55">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <BrandLogo size={36} />
            <div>
              <h1 className="text-base font-semibold leading-tight text-foreground">ESP32 Gateway</h1>
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

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Панель</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Устройства и телеметрия
            </h2>
          </div>
        </div>

        {/* ── Stats row ── */}
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
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
          <Card className="mb-6 border-destructive/20 bg-destructive/10">
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
          <Card className="border-dashed bg-card/50 shadow-none">
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
          <DeviceGrid
            devices={devices}
            onCommand={sendCommand}
            onDelete={deleteDevice}
            onRename={renameDevice}
            onReorder={reorderDevices}
          />
        )}

        {/* ── Commands reference ── */}
        <div className="mt-8">
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
      <CardContent className="flex items-center gap-3 p-4 sm:p-5">
        <div className={`flex size-10 shrink-0 items-center justify-center rounded-2xl ${iconBgStyles[color]}`}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            {label}
          </p>
          <p className={`text-3xl font-semibold tracking-tight tabular-nums ${colorStyles[color]}`}>
            {value}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
