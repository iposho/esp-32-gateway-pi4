'use client'

import { useEffect, useState } from 'react'
import {
  Lightbulb,
  RotateCw,
  Send,
  Wifi,
  WifiOff,
  Gauge,
  ChevronDown,
  Check,
} from 'lucide-react'
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
  const [custom, setCustom] = useState('{ "action": "led", "value": true }')
  const [sending, setSending] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [ledOn, setLedOn] = useState(false)

  const online = device.is_online
  const payload = device.latest?.payload ?? {}
  const entries = Object.entries(payload)

  useEffect(() => {
    if (!ok) return
    const t = setTimeout(() => setOk(null), 2500)
    return () => clearTimeout(t)
  }, [ok])

  async function send(payload: Record<string, unknown>, key: string) {
    setSending(key)
    setErr(null)
    setOk(null)
    try {
      await onCommand(device.device_id, payload)
      setOk(key)
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

  function toggleLed() {
    const next = !ledOn
    setLedOn(next)
    void send({ action: 'led', value: next }, 'led')
  }

  function reboot() {
    if (!window.confirm(`Перезагрузить ${device.device_id}?`)) return
    void send({ action: 'reboot' }, 'reboot')
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

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={ledOn ? 'default' : 'secondary'}
            disabled={!online || sending !== null}
            onClick={toggleLed}
          >
            <Lightbulb className="size-3.5" />
            {sending === 'led' ? '…' : ledOn ? 'LED выкл' : 'LED вкл'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!online || sending !== null}
            onClick={reboot}
          >
            <RotateCw className={`size-3.5 ${sending === 'reboot' ? 'animate-spin' : ''}`} />
            {sending === 'reboot' ? '…' : 'Перезагрузка'}
          </Button>
        </div>

        {(ok || err) && (
          <div
            role="status"
            className={
              ok
                ? 'flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-3 py-2 text-xs text-emerald-600 dark:text-emerald-400'
                : 'rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive'
            }
          >
            {ok && (
              <>
                <Check className="size-3.5 shrink-0" />
                Команда отправлена
              </>
            )}
            {err && err}
          </div>
        )}

        <div className="mt-auto flex flex-col gap-2">
          <label className="text-xs font-medium text-muted-foreground">
            Команда (JSON) → devices/{device.device_id}/command
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
              disabled={!online || sending !== null}
              onClick={sendCustom}
              className="shrink-0"
            >
              <Send className="size-3.5" />
              {sending === 'custom' ? '…' : 'Отпр.'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
