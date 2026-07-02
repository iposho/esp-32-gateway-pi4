'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Save, Eye, Zap, Terminal } from 'lucide-react'
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <Card className="w-full max-w-md overflow-hidden flex flex-col border-border/50 shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-border bg-muted/30">
          <h3 className="font-semibold flex items-center gap-2 text-foreground">
            <Zap className="size-4 text-emerald-500" />
            Управление пинами (GPIO)
          </h3>
          <Button variant="ghost" size="icon-xs" onClick={onClose} disabled={isSending}>
            <X className="size-4" />
          </Button>
        </div>

        <div className="p-4 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Пин (GPIO)</label>
            <Input 
              type="number" 
              placeholder="Например: 2, 4, 32" 
              value={pin} 
              onChange={e => setPin(e.target.value)} 
              disabled={isSending}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Действие</label>
            <div className="flex gap-1.5 bg-muted/50 p-1 rounded-md border border-border/50">
              <button 
                className={`flex-1 text-xs py-1.5 rounded-sm transition-all duration-200 ${action === 'read' ? 'bg-background shadow-sm font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                onClick={() => setAction('read')}
                disabled={isSending}
              >Чтение</button>
              <button 
                className={`flex-1 text-xs py-1.5 rounded-sm transition-all duration-200 ${action === 'write' ? 'bg-background shadow-sm font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                onClick={() => setAction('write')}
                disabled={isSending}
              >Запись</button>
              <button 
                className={`flex-1 text-xs py-1.5 rounded-sm transition-all duration-200 ${action === 'mode' ? 'bg-background shadow-sm font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                onClick={() => setAction('mode')}
                disabled={isSending}
              >Режим</button>
            </div>
          </div>

          {action === 'mode' && (
            <div className="space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
              <label className="text-xs font-medium text-muted-foreground">Режим пина</label>
              <select 
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
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
            <div className="space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
              <label className="text-xs font-medium text-muted-foreground">Значение (0 = LOW, 1 = HIGH, 0-255 = PWM)</label>
              <Input 
                type="number" 
                placeholder="0, 1 или 0-255" 
                value={writeVal} 
                onChange={e => setWriteVal(e.target.value)} 
                disabled={isSending}
              />
            </div>
          )}
        </div>

        {/* Console / Log area */}
        <div className="border-t border-border bg-black/90 p-3 h-40 flex flex-col">
          <div className="flex items-center gap-1.5 mb-2 text-[10px] font-semibold text-zinc-500 uppercase tracking-widest shrink-0">
            <Terminal className="size-3" />
            Терминал команд
          </div>
          <div 
            ref={scrollRef}
            className="flex-1 overflow-y-auto space-y-1 font-mono text-[11px]"
          >
            {logs.length === 0 ? (
              <div className="text-zinc-600 italic">Ожидание команд...</div>
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

        <div className="p-4 border-t border-border bg-muted/10 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isSending}>Закрыть</Button>
          <Button size="sm" onClick={handleSend} disabled={!pin || isSending}>
            {isSending ? 'Отправка...' : (
              action === 'read' ? <><Eye className="size-3 mr-1.5"/>Прочитать</> : <><Save className="size-3 mr-1.5"/>Отправить</>
            )}
          </Button>
        </div>
      </Card>
    </div>
  )
}
