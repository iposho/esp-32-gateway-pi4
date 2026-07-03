'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Save, Eye, Zap, Terminal, RadioReceiver } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import type { Telemetry } from '@/lib/types'

type LogEntry = {
  id: string
  time: Date
  type: 'send' | 'recv' | 'error'
  msg: string
}

export function PinManagerModal({
  isOpen,
  onClose,
  onSend,
  isSending,
  latestTelemetry,
}: {
  isOpen: boolean
  onClose: () => void
  onSend: (payload: Record<string, unknown>) => Promise<void>
  isSending: boolean
  latestTelemetry?: Telemetry | null
}) {
  const [pin, setPin] = useState('')
  const [action, setAction] = useState<'mode' | 'read' | 'write'>('read')
  const [mode, setMode] = useState<'INPUT' | 'OUTPUT' | 'INPUT_PULLUP'>('INPUT')
  const [writeVal, setWriteVal] = useState('1')
  const [logs, setLogs] = useState<LogEntry[]>([])
  
  const lastTeleId = useRef<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Scroll to bottom when logs change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [logs])

  // Watch telemetry for pin responses
  useEffect(() => {
    if (!isOpen || !latestTelemetry) return
    if (latestTelemetry.id === lastTeleId.current) return
    lastTeleId.current = latestTelemetry.id

    const payload = latestTelemetry.payload as Record<string, any>
    
    // Catch anything related to pins
    const pinKeys = Object.keys(payload).filter(k => k.startsWith('pin_') || k === 'pin_error' || k === 'pin_status')
    if (pinKeys.length > 0) {
      const msg = pinKeys.map(k => `${k}: ${payload[k]}`).join(', ')
      setLogs(prev => [...prev, { id: Date.now().toString(), time: new Date(), type: payload.pin_error ? 'error' : 'recv', msg: `<- ${msg}` }])
    }
  }, [latestTelemetry, isOpen])

  if (!isOpen) return null

  const handleSend = async () => {
    const pinNum = parseInt(pin, 10)
    if (isNaN(pinNum)) return

    let payload: Record<string, unknown> = {}
    if (action === 'mode') {
      payload = { action: 'pin_mode', pin: pinNum, mode }
    } else if (action === 'read') {
      payload = { action: 'pin_read', pin: pinNum }
    } else if (action === 'write') {
      payload = { action: 'pin_write', pin: pinNum, value: parseInt(writeVal, 10) }
    }
    
    const msg = `-> ${JSON.stringify(payload)}`
    setLogs(prev => [...prev, { id: Date.now().toString(), time: new Date(), type: 'send', msg }])
    
    try {
      await onSend(payload)
    } catch (e: any) {
      setLogs(prev => [...prev, { id: Date.now().toString(), time: new Date(), type: 'error', msg: `Ошибка: ${e.message}` }])
    }
  }

  const formatTime = (d: Date) => d.toLocaleTimeString('ru-RU', { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-3 backdrop-blur-xl sm:p-6">
      <Card className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden border-white/10 bg-card/90 shadow-2xl">
        <div className="shrink-0 border-b border-border bg-background/35 px-4 py-4 sm:px-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Zap className="size-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold tracking-tight text-foreground">GPIO</h3>
                <p className="mt-0.5 text-sm text-muted-foreground">Быстрые команды и журнал ответов устройства</p>
              </div>
            </div>
            <Button variant="ghost" size="icon-sm" onClick={onClose} disabled={isSending} title="Закрыть">
            <X className="size-4" />
          </Button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 p-4 sm:grid-cols-[1fr_1.1fr] sm:p-5">
          <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Пин GPIO</label>
            <Input 
              type="number" 
              placeholder="Например: 2, 4, 32" 
              value={pin} 
              onChange={e => setPin(e.target.value)} 
              disabled={isSending}
              className="h-11 rounded-xl bg-background/65"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Действие</label>
            <div className="grid grid-cols-3 gap-1 rounded-2xl border border-border bg-background/45 p-1">
              <button 
                className={`min-h-10 rounded-xl text-sm transition-all duration-200 ${action === 'read' ? 'bg-card shadow-sm font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                onClick={() => setAction('read')}
                disabled={isSending}
              >Чтение</button>
              <button 
                className={`min-h-10 rounded-xl text-sm transition-all duration-200 ${action === 'write' ? 'bg-card shadow-sm font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                onClick={() => setAction('write')}
                disabled={isSending}
              >Запись</button>
              <button 
                className={`min-h-10 rounded-xl text-sm transition-all duration-200 ${action === 'mode' ? 'bg-card shadow-sm font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                onClick={() => setAction('mode')}
                disabled={isSending}
              >Режим</button>
            </div>
          </div>

          {action === 'mode' && (
            <div className="animate-in fade-in slide-in-from-top-1 space-y-2 duration-200">
              <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Режим пина</label>
              <select 
                className="flex h-11 w-full rounded-xl border border-input bg-background/65 px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                value={mode}
                onChange={e => setMode(e.target.value as any)}
                disabled={isSending}
              >
                <option value="INPUT">INPUT</option>
                <option value="INPUT_PULLUP">INPUT_PULLUP</option>
                <option value="OUTPUT">OUTPUT</option>
              </select>
            </div>
          )}

          {action === 'write' && (
            <div className="animate-in fade-in slide-in-from-top-1 space-y-2 duration-200">
              <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Значение</label>
              <Input 
                type="number" 
                placeholder="0, 1 или 0-255" 
                value={writeVal} 
                onChange={e => setWriteVal(e.target.value)} 
                disabled={isSending}
                className="h-11 rounded-xl bg-background/65"
              />
              <p className="text-xs leading-5 text-muted-foreground">0 = LOW, 1 = HIGH, 0-255 = PWM.</p>
            </div>
          )}

          <div className="rounded-2xl border border-border bg-background/35 p-3">
            <div className="mb-1 flex items-center gap-2 text-sm font-medium text-foreground">
              <RadioReceiver className="size-4 text-primary" />
              Payload
            </div>
            <code className="block break-all rounded-xl bg-muted/70 p-3 font-mono text-xs leading-5 text-muted-foreground">
              {action === 'mode'
                ? JSON.stringify({ action: 'pin_mode', pin: pin ? Number(pin) : 0, mode })
                : action === 'write'
                  ? JSON.stringify({ action: 'pin_write', pin: pin ? Number(pin) : 0, value: Number(writeVal) })
                  : JSON.stringify({ action: 'pin_read', pin: pin ? Number(pin) : 0 })}
            </code>
          </div>
          </div>

        <div className="flex min-h-[16rem] flex-col overflow-hidden rounded-2xl border border-border bg-black/80 p-3">
          <div className="mb-2 flex shrink-0 items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
            <Terminal className="size-3.5" />
            Журнал
          </div>
          <div 
            ref={scrollRef}
            className="flex-1 space-y-1 overflow-y-auto font-mono text-xs"
          >
            {logs.length === 0 ? (
              <div className="flex h-full items-center justify-center text-zinc-600">Ожидание команд...</div>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="flex gap-2">
                  <span className="text-zinc-500 shrink-0">[{formatTime(log.time)}]</span>
                  <span className={`${
                    log.type === 'send' ? 'text-blue-400' : 
                    log.type === 'error' ? 'text-red-400' : 
                    'text-emerald-400'
                  } break-all`}>
                    {log.msg}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border bg-background/35 p-4 sm:flex-row sm:justify-end sm:px-5">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isSending} className="h-10">Закрыть</Button>
          <Button size="sm" onClick={handleSend} disabled={!pin || isSending} className="h-10">
            {isSending ? 'Отправка...' : (
              action === 'read' ? <><Eye className="size-4"/>Прочитать</> : <><Save className="size-4"/>Отправить</>
            )}
          </Button>
        </div>
      </Card>
    </div>
  )
}
