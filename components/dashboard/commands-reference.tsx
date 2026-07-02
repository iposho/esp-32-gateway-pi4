'use client'

import { useState } from 'react'
import { BookOpen, ChevronDown } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { COMMAND_REFERENCE, MQTT_TOPICS } from '@/lib/commands'

export function CommandsReference() {
  const [open, setOpen] = useState(false)

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <BookOpen className="size-4 text-muted-foreground" />
          Справочник MQTT и команд
        </div>
        <ChevronDown
          className={`size-4 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="flex flex-col gap-5 border-t border-border px-4 py-4">
          <section>
            <h3 className="mb-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
              Топики
            </h3>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[32rem] text-left text-sm">
                <thead className="border-b border-border bg-muted/50 text-[11px] text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Топик</th>
                    <th className="px-3 py-2 font-semibold">Направление</th>
                    <th className="px-3 py-2 font-semibold">Пример payload</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {MQTT_TOPICS.map((row) => (
                    <tr key={row.topic} className="hover:bg-muted/20 transition-colors">
                      <td className="px-3 py-2 font-mono text-xs">{row.topic}</td>
                      <td className="px-3 py-2 text-muted-foreground text-xs">{row.direction}</td>
                      <td className="px-3 py-2">
                        <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                          {row.payload}
                        </code>
                        <p className="mt-1 text-[11px] text-muted-foreground">{row.note}</p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
              Команды (action)
            </h3>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[28rem] text-left text-sm">
                <thead className="border-b border-border bg-muted/50 text-[11px] text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-semibold">action</th>
                    <th className="px-3 py-2 font-semibold">Название</th>
                    <th className="px-3 py-2 font-semibold">JSON</th>
                    <th className="px-3 py-2 font-semibold">Описание</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {COMMAND_REFERENCE.map((cmd) => (
                    <tr key={cmd.action} className="hover:bg-muted/20 transition-colors">
                      <td className="px-3 py-2 font-mono text-xs">{cmd.action}</td>
                      <td className="px-3 py-2 text-xs">{cmd.title}</td>
                      <td className="px-3 py-2">
                        <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                          {cmd.payload}
                        </code>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground text-xs">{cmd.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2.5 text-[11px] text-muted-foreground leading-relaxed">
              Админка публикует в <code className="font-mono bg-muted px-1 py-0.5 rounded text-[10px]">devices/&lt;device_id&gt;/command</code>.
              Своя прошивка должна подписаться на этот топик и разбирать поле{' '}
              <code className="font-mono bg-muted px-1 py-0.5 rounded text-[10px]">action</code>.
            </p>
          </section>
        </div>
      )}
    </Card>
  )
}
