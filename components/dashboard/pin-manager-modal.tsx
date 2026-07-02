'use client'

import { useState } from 'react'
import { X, Save, Eye, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'

export function PinManagerModal({
  isOpen,
  onClose,
  onSend,
  isSending,
}: {
  isOpen: boolean
  onClose: () => void
  onSend: (payload: Record<string, unknown>) => Promise<void>
  isSending: boolean
}) {
  const [pin, setPin] = useState('')
  const [action, setAction] = useState<'mode' | 'read' | 'write'>('read')
  const [mode, setMode] = useState<'INPUT' | 'OUTPUT' | 'INPUT_PULLUP'>('INPUT')
  const [writeVal, setWriteVal] = useState('1')

  if (!isOpen) return null

  const handleSend = () => {
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
    
    onSend(payload)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <Card className="w-full max-w-sm overflow-hidden flex flex-col border-border/50 shadow-2xl">
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

        <div className="p-4 border-t border-border bg-muted/10 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isSending}>Отмена</Button>
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
