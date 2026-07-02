'use client'

import { useState } from 'react'
import { BookOpen, ChevronDown } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { COMMAND_REFERENCE, MQTT_TOPICS } from '@/lib/commands'

export function CommandsReference() {
  const [open, setOpen] = useState(false)

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-2 text-left"
        >
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpen className="size-4 text-muted-foreground" />
            Справочник MQTT и команд
          </CardTitle>
          <ChevronDown
            className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>
      </CardHeader>

      {open && (
        <CardContent className="flex flex-col gap-6 pt-0">
          <section>
            <h3 className="mb-2 text-sm font-medium">Топики</h3>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[32rem] text-left text-sm">
                <thead className="border-b border-border bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Топик</th>
                    <th className="px-3 py-2 font-medium">Направление</th>
                    <th className="px-3 py-2 font-medium">Пример payload</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {MQTT_TOPICS.map((row) => (
                    <tr key={row.topic}>
                      <td className="px-3 py-2 font-mono text-xs">{row.topic}</td>
                      <td className="px-3 py-2 text-muted-foreground">{row.direction}</td>
                      <td className="px-3 py-2">
                        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                          {row.payload}
                        </code>
                        <p className="mt-1 text-xs text-muted-foreground">{row.note}</p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-medium">Команды (action)</h3>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[28rem] text-left text-sm">
                <thead className="border-b border-border bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">action</th>
                    <th className="px-3 py-2 font-medium">Название</th>
                    <th className="px-3 py-2 font-medium">JSON</th>
                    <th className="px-3 py-2 font-medium">Описание</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {COMMAND_REFERENCE.map((cmd) => (
                    <tr key={cmd.action}>
                      <td className="px-3 py-2 font-mono text-xs">{cmd.action}</td>
                      <td className="px-3 py-2">{cmd.title}</td>
                      <td className="px-3 py-2">
                        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                          {cmd.payload}
                        </code>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{cmd.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Админка публикует в <code className="font-mono">devices/&lt;device_id&gt;/command</code>.
              Своя прошивка должна подписаться на этот топик и разбирать поле{' '}
              <code className="font-mono">action</code>.
            </p>
          </section>
        </CardContent>
      )}
    </Card>
  )
}
