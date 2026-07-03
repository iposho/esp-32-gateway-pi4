'use client'

import { useEffect, useState, useRef } from 'react'
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
  Upload,
  Cpu,
  FolderOpen,
  WifiOff,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { timeAgo, formatValue, labelForKey } from '@/lib/format'
import type { Device, Telemetry } from '@/lib/types'
import { toast } from 'sonner'
import { PinManagerModal } from './pin-manager-modal'
import { FileManagerModal } from './file-manager-modal'


type DeviceWithLatest = Device & { latest: Telemetry | null }

const SERVICE_TELEMETRY_KEYS = new Set([
  'last_photo_url',
  'ota',
  'progress',
  'camera_ready',
  'pin_error',
  'pin_status',
  'fs_ls',
  'fs_file',
  'content',
])

const isServiceTelemetryKey = (key: string) => {
  const normalized = key.toLowerCase()
  return (
    SERVICE_TELEMETRY_KEYS.has(normalized) ||
    normalized.startsWith('pin_') ||
    normalized.startsWith('fs_')
  )
}

const OTA_LABELS: Record<string, string> = {
  downloading: 'OTA: загрузка',
  writing: 'OTA: запись',
  success: 'OTA: готово',
  failed: 'OTA: ошибка',
}

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
  const [isUploading, setIsUploading] = useState(false)
  const [isPinModalOpen, setIsPinModalOpen] = useState(false)
  const [isFileModalOpen, setIsFileModalOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const online = device.is_online
  const payload = device.latest?.payload ?? {}
  const entries = Object.entries(payload).filter(([k]) => !isServiceTelemetryKey(k))
  const isCamera = payload.camera_ready !== undefined || payload.last_photo_url !== undefined
  
  const otaStatus = payload.ota as string | undefined
  const otaProgress = typeof payload.progress === 'number' ? payload.progress : 0
  const isOtaActive = otaStatus && otaStatus !== 'failed' && otaStatus !== 'success'
  const otaLabel = otaStatus ? OTA_LABELS[otaStatus] ?? `OTA: ${otaStatus}` : null
  const cameraReady = payload.camera_ready === true
  const cameraStatusLabel =
    payload.camera_ready === true
      ? 'Камера готова'
      : payload.camera_ready === false
        ? 'Камера не готова'
        : 'Есть снимок'
  const hasCameraSignal = cameraReady || Boolean(payload.last_photo_url)

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

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('deviceId', device.device_id)

      const res = await fetch('/api/ota', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Ошибка загрузки')
      }

      toast.success('Прошивка отправлена на устройство')
    } catch (err: any) {
      toast.error(err.message || 'Ошибка OTA обновления')
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const isBalcony =
    device.name?.toLowerCase().includes('балкон') ||
    device.name?.toLowerCase().includes('balcony') ||
    device.device_id.toLowerCase().includes('balcony')

  return (
    <>
      <Card
        className={`group/card relative flex flex-col overflow-hidden bg-card/75 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/20 ${
        isDeleting ? 'opacity-50 pointer-events-none scale-[0.98]' : ''
      } ${online ? 'hover:shadow-emerald-500/10' : ''}`}
    >
      {/* ── Status accent strip ── */}
      <div
        className={`h-1 w-full transition-colors duration-500 ${
          online
            ? 'bg-gradient-to-r from-emerald-500 via-primary to-emerald-400'
            : 'bg-muted'
        }`}
      />

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3 p-4 pb-3 sm:p-5 sm:pb-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <div
              className={`flex size-11 shrink-0 items-center justify-center rounded-2xl transition-colors ${
                online
                  ? 'bg-emerald-500/10 text-emerald-600 shadow-inner shadow-white/10 dark:bg-emerald-400/10 dark:text-emerald-400'
                  : 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500'
              }`}
            >
              <Activity className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <h3 className="truncate text-base font-semibold tracking-tight text-foreground">{device.name}</h3>
              </div>
              <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
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
            size="icon-sm"
            className="shrink-0 text-muted-foreground/55 opacity-100 hover:bg-destructive/10 hover:text-destructive sm:opacity-0 sm:group-hover/card:opacity-100"
            onClick={handleDelete}
            title="Удалить устройство"
          >
            <Trash2 className="size-3" />
          </Button>
        )}
      </div>

      <div className="px-4 pb-3 sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant={online ? 'online' : 'outline'}
            className={`h-7 px-2.5 text-xs ${online ? '' : 'border-border text-muted-foreground'}`}
          >
            {online ? (
              <>
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-40" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-current" />
                </span>
                Онлайн
              </>
            ) : (
              <>
                <WifiOff className="size-3" />
                Оффлайн
              </>
            )}
          </Badge>

          {isCamera && (
            <Badge
              variant="outline"
              className={`h-7 px-2.5 text-xs ${
                hasCameraSignal
                  ? 'border-primary/25 bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground'
              }`}
            >
              {hasCameraSignal ? <Camera className="size-3" /> : <CameraOff className="size-3" />}
              {cameraStatusLabel}
            </Badge>
          )}

          {otaLabel && (
            <Badge
              variant="outline"
              className={`h-7 px-2.5 text-xs ${
                otaStatus === 'failed'
                  ? 'border-destructive/25 bg-destructive/10 text-destructive'
                  : 'border-primary/25 bg-primary/10 text-primary'
              }`}
            >
              <RefreshCw className={`size-3 ${isOtaActive ? 'animate-spin' : ''}`} />
              {otaLabel}
              {isOtaActive ? ` ${Math.round(otaProgress)}%` : ''}
            </Badge>
          )}
        </div>
      </div>

      {/* ── Camera section ── */}
      {isCamera && (
        <div className="px-4 pb-3 sm:px-5">
          <div className="overflow-hidden rounded-2xl border border-border bg-muted/25">
            {!online ? (
              /* ── Offline camera placeholder ── */
              <div className="flex aspect-video flex-col items-center justify-center gap-2 bg-muted/40 text-muted-foreground/60">
                <CameraOff className="size-8 opacity-40" />
                <span className="text-xs">Камера офлайн</span>
              </div>
            ) : payload.last_photo_url ? (
              <div className="relative flex aspect-video items-center justify-center bg-black/5 dark:bg-black/20">
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
              <div className="flex aspect-video items-center justify-center text-sm text-muted-foreground">
                Нет снимка
              </div>
            )}
            {online && (
              <div className="flex items-center gap-2 border-t border-border bg-background/45 p-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-9 flex-1 text-xs text-muted-foreground hover:text-foreground"
                  disabled={!online || sending !== null}
                  onClick={capturePhoto}
                >
                  <Camera className="size-3" />
                  {sending === 'capture' ? 'Делаем...' : 'Снимок'}
                </Button>
                <div className="w-px h-4 bg-border" />
                <Button
                  size="icon-sm"
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

      {/* ── OTA Progress ── */}
      {otaStatus && (
        <div className="px-4 pb-3 sm:px-5">
          <div className="rounded-2xl border border-primary/15 bg-primary/10 p-3">
            <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              <span className="flex items-center gap-1.5">
                <RefreshCw className={`size-3 ${isOtaActive ? 'animate-spin' : ''}`} />
                Обновление прошивки
              </span>
              <span className="text-muted-foreground">{otaLabel}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
              <div 
                className={`h-full transition-all duration-500 ${otaStatus === 'failed' ? 'bg-destructive' : 'bg-primary'}`} 
                style={{ width: `${Math.max(0, Math.min(100, otaProgress))}%` }} 
              />
            </div>
            <div className="mt-1.5 text-right text-[10px] font-medium text-muted-foreground">
              {Math.round(otaProgress)}%
            </div>
          </div>
        </div>
      )}

      {/* ── Telemetry ── */}
      <div className="px-4 pb-3 sm:px-5">
        <div className="rounded-2xl border border-border bg-background/35 p-3">
          <div className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
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
                  className={`flex items-center justify-between gap-3 py-2 ${
                    i > 0 ? 'border-t border-border/50' : ''
                  }`}
                >
                  <span className="min-w-0 truncate text-sm text-muted-foreground">{labelForKey(k)}</span>
                  <span className="shrink-0 text-right font-mono text-sm font-medium tabular-nums text-foreground">
                    {formatValue(v, k)}
                  </span>
                </div>
              ))}
            </div>
          )}
          {entries.length > 4 && (
            <button
              onClick={() => setExpanded((s) => !s)}
              className="mt-2 flex min-h-9 items-center gap-1 text-xs font-medium text-primary/75 transition-colors hover:text-primary"
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
      <div className="px-4 pb-4 sm:px-5">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          <Zap className="size-3" />
          Управление
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button
            size="sm"
            variant={ledOn ? 'default' : 'outline'}
            disabled={!online || sending !== null}
            onClick={toggleLed}
            className="h-9 justify-start"
          >
            <Lightbulb className="size-3" />
            {sending === 'led' ? '…' : ledOn ? 'LED выкл' : 'LED вкл'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!online || sending !== null}
            onClick={reboot}
            className="h-9 justify-start"
          >
            <RotateCw className={`size-3 ${sending === 'reboot' ? 'animate-spin' : ''}`} />
            {sending === 'reboot' ? '…' : 'Ребут'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!online || sending !== null || isUploading}
            onClick={() => fileInputRef.current?.click()}
            className="h-9 justify-start"
          >
            <Upload className={`size-3 ${isUploading ? 'animate-bounce' : ''}`} />
            {isUploading ? 'OTA...' : 'OTA'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!online || sending !== null}
            onClick={() => setIsPinModalOpen(true)}
            className="h-9 justify-start"
          >
            <Cpu className="size-3" />
            Пины
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!online || sending !== null}
            onClick={() => setIsFileModalOpen(true)}
            className="h-9 justify-start"
          >
            <FolderOpen className="size-3" />
            Файлы
          </Button>
          <input
            type="file"
            accept=".bin"
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileUpload}
          />
          {isBalcony && (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={!online || sending !== null}
                onClick={() => send({ action: 'sync' }, 'sync')}
                className="h-9 justify-start"
              >
                <RefreshCw className={`size-3 ${sending === 'sync' ? 'animate-spin' : ''}`} />
                {sending === 'sync' ? '…' : 'Синх.'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!online || sending !== null}
                onClick={() => send({ action: 'push' }, 'push')}
                className="h-9 justify-start"
              >
                <Send className={`size-3 ${sending === 'push' ? 'animate-spin' : ''}`} />
                {sending === 'push' ? '…' : 'Push'}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ── Custom command ── */}
      <div className="mt-auto border-t border-border/50 bg-background/30 px-4 py-3 sm:px-5">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          <Terminal className="size-3" />
          Произвольная команда
        </div>
        <div className="flex gap-2">
          <Input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            className="h-9 rounded-xl bg-background/60 font-mono text-xs"
            spellCheck={false}
            placeholder='{ "action": "..." }'
          />
          <Button
            size="sm"
            variant="outline"
            disabled={!online || sending !== null}
            onClick={sendCustom}
            className="h-9 shrink-0"
          >
            <Send className="size-3" />
            {sending === 'custom' ? '…' : 'Отпр.'}
          </Button>
        </div>
      </div>
    </Card>
    
    <PinManagerModal
      isOpen={isPinModalOpen}
      onClose={() => setIsPinModalOpen(false)}
      onSend={async (payload) => {
        await send(payload, 'pin')
      }}
      isSending={sending === 'pin'}
      latestTelemetry={device.latest}
    />

    <FileManagerModal
      isOpen={isFileModalOpen}
      onClose={() => setIsFileModalOpen(false)}
      onSend={async (payload) => {
        await send(payload, 'file')
      }}
      isSending={sending === 'file'}
      latestTelemetry={device.latest}
    />
    </>
  )
}
