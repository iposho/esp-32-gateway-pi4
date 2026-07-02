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
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-black/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-md bg-black text-white dark:bg-white dark:text-black shadow-sm">
              <Cpu className="size-5" />
            </div>
            <div>
              <h1 className="text-sm font-medium leading-tight">ESP32 Gateway</h1>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">esp32.kuzyak.in</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => mutate()} className="text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
              <RefreshCw className={`size-4 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Обновить</span>
            </Button>
            <Button variant="outline" size="sm" onClick={logout} className="border-zinc-200 dark:border-zinc-800">
              <LogOut className="size-4" />
              <span className="hidden sm:inline">Выход</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        {/* Сводка */}
        <div className="mb-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            icon={<Radio className="size-4" />}
            label="Всего устройств"
            value={devices.length}
          />
          <StatCard
            icon={<Wifi className="size-4 text-emerald-500" />}
            label="Онлайн"
            value={online}
          />
          <StatCard
            icon={<WifiOff className="size-4 text-zinc-400" />}
            label="Оффлайн"
            value={devices.length - online}
          />
        </div>

        {error && (
          <Card className="mb-8 border-red-500/20 bg-red-50/50 dark:bg-red-950/20">
            <CardContent className="py-4 text-sm text-red-600 dark:text-red-400">
              Не удалось загрузить устройства. Проверьте подключение к Supabase.
            </CardContent>
          </Card>
        )}

        {isLoading && devices.length === 0 ? (
          <div className="flex items-center justify-center py-20 text-sm text-zinc-500">
            Загрузка списка устройств...
          </div>
        ) : devices.length === 0 ? (
          <Card className="border-dashed border-zinc-200 dark:border-zinc-800 bg-transparent shadow-none">
            <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="rounded-full bg-zinc-100 p-3 dark:bg-zinc-900">
                <Radio className="size-6 text-zinc-400" />
              </div>
              <h3 className="font-medium">Устройств пока нет</h3>
              <p className="max-w-sm text-sm text-zinc-500 text-balance">
                Как только ESP32 отправит сообщение в MQTT, Node-RED создаст запись,
                и устройство появится здесь.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {devices.map((d) => (
              <DeviceCard key={d.id} device={d} onCommand={sendCommand} onDelete={deleteDevice} />
            ))}
          </div>
        )}

        <div className="mt-12">
          <CommandsReference />
        </div>
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
    <Card className="border-zinc-200 shadow-sm dark:border-zinc-800">
      <CardContent className="flex flex-col gap-2 p-5">
        <div className="flex items-center gap-2 text-sm font-medium text-zinc-500 dark:text-zinc-400">
          {icon}
          <span className="truncate">{label}</span>
        </div>
        <span className="text-3xl font-semibold tracking-tight">{value}</span>
      </CardContent>
    </Card>
  )
}

