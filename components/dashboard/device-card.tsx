'use client'

import { useState } from 'react'
import { Power, Send, Wifi, WifiOff, Gauge, ChevronDown } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { timeAgo, formatValue } from '@/lib/format'
import type { Device, Telemetry } from '@/lib/types'

type DeviceWithLatest = Device & { latest: Telemetry | null }

export function DeviceCard({
  device,
  onCommand,
}: {
  device: DeviceWithLatest
  onCommand: (deviceId: string, payload: Record<string, unknown>) => Promise<void>
}) {
  const [custom, setCustom] = useState('{ "relay": 1, "state": "on" }')
  const [sending, setSending] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)

  const online = device.is_online
  const payload = device.latest?.payload ?? {}
  const entries = Object.entries(payload)

  async function send(payload: Record<string, unknown>, key: string) {
    setSending(key)
    setErr(null)
    try {
      await onCommand(device.device_id, payload)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ошибка отправки')
    } finally {
      setSending(null)
    }
  }

  function sendCustom() {
    try {
      const parsed = JSON.parse(custom)
      void send(parsed, 'custom')
    } catch {
      setErr('Невалидный JSON')
    }
  }

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-semibold">{device.name}</h3>
            <Badge variant={online ? 'online' : 'offline'}>
              {online ? <Wifi className="size-3" /> : <WifiOff className="size-3" />}
              {online ? 'online' : 'offline'}
            </Badge>
          </div>
          <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
            {device.device_id}
          </p>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">
          {timeAgo(device.last_seen)}
        </span>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-4">
        {/* Телеметрия */}
        <div className="rounded-lg border border-border bg-muted/40 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Gauge className="size-3.5" />
            Телеметрия
          </div>
          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">Нет данных</p>
          ) : (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              {entries.slice(0, expanded ? entries.length : 4).map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-2">
                  <dt className="truncate text-xs text-muted-foreground">{k}</dt>
                  <dd className="font-mono text-sm font-medium tabular-nums">
                    {formatValue(v)}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {entries.length > 4 && (
            <button
              onClick={() => setExpanded((s) => !s)}
              className="mt-2 flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <ChevronDown
                className={`size-3 transition-transform ${expanded ? 'rotate-180' : ''}`}
              />
              {expanded ? 'Свернуть' : `Ещё ${entries.length - 4}`}
            </button>
          )}
        </div>

        {/* Быстрые команды */}
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={sending !== null}
            onClick={() => send({ relay: 1, state: 'on' }, 'on')}
          >
            <Power className="size-3.5" />
            Реле ON
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={sending !== null}
            onClick={() => send({ relay: 1, state: 'off' }, 'off')}
          >
            <Power className="size-3.5" />
            Реле OFF
          </Button>
        </div>

        {/* Произвольная команда */}
        <div className="mt-auto flex flex-col gap-2">
          <label className="text-xs font-medium text-muted-foreground">
            Команда (JSON) → esp32/{device.device_id}/cmd
          </label>
          <div className="flex gap-2">
            <Input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              className="font-mono text-xs"
              spellCheck={false}
            />
            <Button
              size="sm"
              disabled={sending !== null}
              onClick={sendCustom}
              className="shrink-0"
            >
              <Send className="size-3.5" />
              {sending === 'custom' ? '…' : 'Отпр.'}
            </Button>
          </div>
          {err && <p className="text-xs text-destructive">{err}</p>}
        </div>
      </CardContent>
    </Card>
  )
}
