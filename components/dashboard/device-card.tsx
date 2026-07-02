'use client'

import { useEffect, useState } from 'react'
import {
  Lightbulb,
  RotateCw,
  Send,
  Gauge,
  ChevronDown,
  Trash2,
  Camera,
  CameraOff,
  RefreshCw,
  Zap,
  Terminal,
  Activity,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { timeAgo, formatValue, labelForKey } from '@/lib/format'
import type { Device, Telemetry } from '@/lib/types'
import { toast } from 'sonner'


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
  const [expanded, setExpanded] = useState(false)
  const [ledOn, setLedOn] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [imgTimestamp, setImgTimestamp] = useState(Date.now())
  const [imgLoading, setImgLoading] = useState(false)

  const online = device.is_online
  const payload = device.latest?.payload ?? {}
  const entries = Object.entries(payload).filter(([k]) => k !== 'last_photo_url')
  const isCamera = payload.camera_ready !== undefined || payload.last_photo_url !== undefined

  // Обновляем картинку при изменении телеметрии с новой фотографией
  useEffect(() => {
    if (payload.capture_count) {
      setImgTimestamp(Date.now())
    }
  }, [payload.capture_count])

  async function send(payload: Record<string, unknown>, key: string) {
    setSending(key)
    try {
      await onCommand(device.device_id, payload)
      toast.success('Команда отправлена')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка отправки')
    } finally {
      setSending(null)
    }
  }

  function sendCustom() {
    try {
      const parsed = JSON.parse(custom)
      void send(parsed, 'custom')
    } catch (err: any) {
      toast.error('Невалидный JSON')
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
    try {
      await onDelete(device.device_id)
      toast.success('Устройство удалено')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка удаления')
      setIsDeleting(false)
    }
  }

  const isBalcony =
    device.name?.toLowerCase().includes('балкон') ||
    device.name?.toLowerCase().includes('balcony') ||
    device.device_id.toLowerCase().includes('balcony')

  return (
    <Card
      className={`group/card relative flex flex-col overflow-hidden transition-all duration-300 ${
        isDeleting ? 'opacity-50 pointer-events-none scale-[0.98]' : ''
      } ${online ? 'hover:shadow-md hover:shadow-emerald-500/5' : 'hover:shadow-md'}`}
    >
      {/* ── Status accent strip ── */}
      <div
        className={`h-[2px] w-full transition-colors duration-500 ${
          online
            ? 'bg-gradient-to-r from-emerald-500/60 via-emerald-400/40 to-emerald-500/60'
            : 'bg-gradient-to-r from-zinc-300/40 via-zinc-400/20 to-zinc-300/40 dark:from-zinc-700/40 dark:via-zinc-600/20 dark:to-zinc-700/40'
        }`}
      />

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3 p-4 pb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <div
              className={`flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
                online
                  ? 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-400'
                  : 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500'
              }`}
            >
              <Activity className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="truncate text-sm font-semibold text-foreground">{device.name}</h3>
                <Badge
                  variant={online ? 'online' : 'offline'}
                  className={`shrink-0 text-[10px] px-1.5 py-0 h-[18px] ${
                    online ? '' : 'opacity-60'
                  }`}
                >
                  {online ? (
                    <>
                      <span className="relative flex size-1.5">
                        <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-40" />
                        <span className="relative inline-flex size-1.5 rounded-full bg-current" />
                      </span>
                      Online
                    </>
                  ) : (
                    'Offline'
                  )}
                </Badge>
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="truncate font-mono opacity-70">{device.device_id}</span>
                <span className="text-border">·</span>
                <span className="shrink-0 tabular-nums">{timeAgo(device.last_seen)}</span>
              </div>
            </div>
          </div>
        </div>
        {onDelete && (
          <Button
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 shrink-0 opacity-0 group-hover/card:opacity-100 transition-opacity"
            onClick={handleDelete}
            title="Удалить устройство"
          >
            <Trash2 className="size-3" />
          </Button>
        )}
      </div>

      {/* ── Camera section ── */}
      {isCamera && (
        <div className="px-4 pb-3">
          <div className="overflow-hidden rounded-lg border border-border bg-muted/30">
            {!online ? (
              /* ── Offline camera placeholder ── */
              <div className="flex aspect-video flex-col items-center justify-center gap-2 bg-muted/40 text-muted-foreground/50">
                <CameraOff className="size-8 opacity-40" />
                <span className="text-xs">Камера офлайн</span>
              </div>
            ) : payload.last_photo_url ? (
              <div className="relative aspect-video bg-black/5 dark:bg-black/20 flex items-center justify-center">
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
              <div className="flex aspect-video items-center justify-center text-xs text-muted-foreground">
                Нет снимка
              </div>
            )}
            {online && (
              <div className="flex items-center gap-1.5 border-t border-border bg-muted/40 p-1.5">
                <Button
                  size="xs"
                  variant="ghost"
                  className="flex-1 text-[11px] text-muted-foreground hover:text-foreground"
                  disabled={!online || sending !== null}
                  onClick={capturePhoto}
                >
                  <Camera className="size-3" />
                  {sending === 'capture' ? 'Делаем...' : 'Снимок'}
                </Button>
                <div className="w-px h-4 bg-border" />
                <Button
                  size="icon-xs"
                  variant="ghost"
                  className="text-muted-foreground hover:text-foreground shrink-0"
                  onClick={refreshPhoto}
                  title="Обновить картинку"
                >
                  <RefreshCw className={`size-3 ${imgLoading ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Telemetry ── */}
      <div className="px-4 pb-3">
        <div className="rounded-lg border border-border bg-muted/20 p-3">
          <div className="mb-2.5 flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
            <Gauge className="size-3" />
            Телеметрия
          </div>
          {entries.length === 0 ? (
            <p className="text-xs text-muted-foreground/60 py-1">Нет данных</p>
          ) : (
            <div className="space-y-0">
              {entries.slice(0, expanded ? entries.length : 4).map(([k, v], i) => (
                <div
                  key={k}
                  className={`flex items-center justify-between gap-3 py-1.5 ${
                    i > 0 ? 'border-t border-border/50' : ''
                  }`}
                >
                  <span className="truncate text-xs text-muted-foreground">{labelForKey(k)}</span>
                  <span className="font-mono text-xs font-medium text-foreground tabular-nums shrink-0">
                    {formatValue(v, k)}
                  </span>
                </div>
              ))}
            </div>
          )}
          {entries.length > 4 && (
            <button
              onClick={() => setExpanded((s) => !s)}
              className="mt-2 flex items-center gap-1 text-[11px] font-medium text-primary/70 hover:text-primary transition-colors"
            >
              <ChevronDown
                className={`size-3 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
              />
              {expanded ? 'Свернуть' : `Ещё ${entries.length - 4}`}
            </button>
          )}
        </div>
      </div>

      {/* ── Actions ── */}
      <div className="px-4 pb-3">
        <div className="flex items-center gap-1.5 mb-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
          <Zap className="size-3" />
          Управление
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="xs"
            variant={ledOn ? 'default' : 'outline'}
            disabled={!online || sending !== null}
            onClick={toggleLed}
            className={ledOn ? '' : ''}
          >
            <Lightbulb className="size-3" />
            {sending === 'led' ? '…' : ledOn ? 'LED выкл' : 'LED вкл'}
          </Button>
          <Button
            size="xs"
            variant="outline"
            disabled={!online || sending !== null}
            onClick={reboot}
          >
            <RotateCw className={`size-3 ${sending === 'reboot' ? 'animate-spin' : ''}`} />
            {sending === 'reboot' ? '…' : 'Ребут'}
          </Button>
          {isBalcony && (
            <>
              <Button
                size="xs"
                variant="outline"
                disabled={!online || sending !== null}
                onClick={() => send({ action: 'sync' }, 'sync')}
              >
                <RefreshCw className={`size-3 ${sending === 'sync' ? 'animate-spin' : ''}`} />
                {sending === 'sync' ? '…' : 'Синх.'}
              </Button>
              <Button
                size="xs"
                variant="outline"
                disabled={!online || sending !== null}
                onClick={() => send({ action: 'push' }, 'push')}
              >
                <Send className={`size-3 ${sending === 'push' ? 'animate-spin' : ''}`} />
                {sending === 'push' ? '…' : 'Push'}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ── Custom command ── */}
      <div className="mt-auto border-t border-border/50 bg-muted/20 px-4 py-3">
        <div className="flex items-center gap-1.5 mb-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
          <Terminal className="size-3" />
          Произвольная команда
        </div>
        <div className="flex gap-1.5">
          <Input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            className="h-7 font-mono text-[11px]"
            spellCheck={false}
            placeholder='{ "action": "..." }'
          />
          <Button
            size="xs"
            variant="outline"
            disabled={!online || sending !== null}
            onClick={sendCustom}
            className="shrink-0"
          >
            <Send className="size-3" />
            {sending === 'custom' ? '…' : 'Отпр.'}
          </Button>
        </div>
      </div>
    </Card>
  )
}
