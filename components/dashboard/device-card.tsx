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
  Trash2,
  Camera,
  RefreshCw,
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
  onDelete,
}: {
  device: DeviceWithLatest
  onCommand: (deviceId: string, payload: Record<string, unknown>) => Promise<void>
  onDelete?: (deviceId: string) => Promise<void>
}) {
  const [custom, setCustom] = useState('{ "action": "led", "value": true }')
  const [sending, setSending] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [ledOn, setLedOn] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [imgTimestamp, setImgTimestamp] = useState(Date.now())
  const [imgLoading, setImgLoading] = useState(false)

  const online = device.is_online
  const payload = device.latest?.payload ?? {}
  const entries = Object.entries(payload).filter(([k]) => k !== 'last_photo_url')
  const isCamera = payload.camera_ready !== undefined || payload.last_photo_url !== undefined

  useEffect(() => {
    if (!ok) return
    const t = setTimeout(() => setOk(null), 2500)
    return () => clearTimeout(t)
  }, [ok])

  // Обновляем картинку при изменении телеметрии с новой фотографией
  useEffect(() => {
    if (payload.capture_count) {
      setImgTimestamp(Date.now())
    }
  }, [payload.capture_count])

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
  
  function capturePhoto() {
    void send({ action: 'capture' }, 'capture')
  }

  function refreshPhoto() {
    setImgLoading(true)
    setImgTimestamp(Date.now())
  }

  async function handleDelete() {
    if (!onDelete) return
    if (!window.confirm(`Вы уверены, что хотите удалить устройство ${device.name || device.device_id}?`)) return
    
    setIsDeleting(true)
    setErr(null)
    try {
      await onDelete(device.device_id)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ошибка удаления')
      setIsDeleting(false)
    }
  }

  return (
    <Card className={`flex flex-col border-zinc-200 shadow-sm transition-opacity dark:border-zinc-800 ${isDeleting ? 'opacity-50 pointer-events-none' : ''}`}>
      <CardHeader className="flex-row items-start justify-between gap-3 pb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-medium text-zinc-900 dark:text-zinc-100">{device.name}</h3>
            {online ? (
              <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-400 font-normal">
                <span className="mr-1.5 flex size-1.5 rounded-full bg-emerald-500"></span>
                Online
              </Badge>
            ) : (
              <Badge variant="outline" className="border-zinc-300 bg-zinc-100 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 font-normal">
                Offline
              </Badge>
            )}
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
            <p className="truncate font-mono">{device.device_id}</p>
            <span className="shrink-0">{timeAgo(device.last_seen)}</span>
          </div>
        </div>
        {onDelete && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 shrink-0 -mr-2 -mt-1"
            onClick={handleDelete}
            title="Удалить устройство"
          >
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-5 pt-0">
        {isCamera && (
          <div className="overflow-hidden rounded-md border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900">
            {payload.last_photo_url ? (
              <div className="relative aspect-video bg-black/5 flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/devices/${device.device_id}/camera?t=${imgTimestamp}`}
                  alt="Camera snapshot"
                  className={`w-full h-full object-contain transition-opacity duration-300 ${imgLoading ? 'opacity-50' : 'opacity-100'}`}
                  onLoad={() => setImgLoading(false)}
                  onError={() => setImgLoading(false)}
                />
              </div>
            ) : (
              <div className="flex aspect-video items-center justify-center text-xs text-zinc-500">
                Нет снимка
              </div>
            )}
            <div className="flex items-center gap-2 bg-zinc-50/80 p-2 border-t border-zinc-200 dark:bg-zinc-900/80 dark:border-zinc-800">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs border-zinc-200 dark:border-zinc-800 flex-1"
                disabled={!online || sending !== null}
                onClick={capturePhoto}
              >
                <Camera className="size-3 mr-1" />
                {sending === 'capture' ? 'Делаем...' : 'Сделать снимок'}
              </Button>
              <Button
                size="icon"
                variant="outline"
                className="h-7 w-7 border-zinc-200 dark:border-zinc-800 shrink-0"
                onClick={refreshPhoto}
                title="Обновить картинку"
              >
                <RefreshCw className={`size-3 ${imgLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        )}

        <div className="rounded-md border border-zinc-200 bg-zinc-50/50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50">
          <div className="mb-3 flex items-center gap-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
            <Gauge className="size-3.5" />
            Телеметрия
          </div>
          {entries.length === 0 ? (
            <p className="text-sm text-zinc-500">Нет данных</p>
          ) : (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
              {entries.slice(0, expanded ? entries.length : 4).map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-2 border-b border-zinc-200/50 pb-1 last:border-0 dark:border-zinc-800/50">
                  <dt className="truncate text-xs text-zinc-500 dark:text-zinc-400">{k}</dt>
                  <dd className="font-mono text-xs font-medium text-zinc-900 dark:text-zinc-100 tabular-nums">
                    {formatValue(v)}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {entries.length > 4 && (
            <button
              onClick={() => setExpanded((s) => !s)}
              className="mt-3 flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
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
            variant={ledOn ? 'default' : 'outline'}
            disabled={!online || sending !== null}
            onClick={toggleLed}
            className={`h-8 ${ledOn ? 'bg-black text-white dark:bg-white dark:text-black' : 'border-zinc-200 dark:border-zinc-800'}`}
          >
            <Lightbulb className="size-3.5" />
            {sending === 'led' ? '…' : ledOn ? 'LED выкл' : 'LED вкл'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!online || sending !== null}
            onClick={reboot}
            className="h-8 border-zinc-200 dark:border-zinc-800"
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
                ? 'flex items-center gap-1.5 rounded-md border border-emerald-500/20 bg-emerald-50/50 px-3 py-2 text-xs text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400'
                : 'flex items-center gap-1.5 rounded-md border border-red-500/20 bg-red-50/50 px-3 py-2 text-xs text-red-600 dark:bg-red-950/20 dark:text-red-400'
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

        <div className="mt-auto flex flex-col gap-2 pt-2">
          <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Команда (JSON) → <span className="font-mono text-zinc-400 dark:text-zinc-500">command</span>
          </label>
          <div className="flex gap-2">
            <Input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              className="h-8 font-mono text-xs border-zinc-200 dark:border-zinc-800"
              spellCheck={false}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={!online || sending !== null}
              onClick={sendCustom}
              className="h-8 shrink-0 border-zinc-200 dark:border-zinc-800"
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


