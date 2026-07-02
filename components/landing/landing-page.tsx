import Link from 'next/link'
import {
  ArrowRight,
  Cpu,
  Database,
  GitBranch,
  LockKeyhole,
  Radio,
  Server,
  Workflow,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

const STACK = [
  {
    icon: Server,
    name: 'Next.js 16',
    role: 'Админка: вход, дашборд, отправка команд',
  },
  {
    icon: Radio,
    name: 'Mosquitto',
    role: 'MQTT-брокер между ESP32 и бэкендом',
  },
  {
    icon: Workflow,
    name: 'Node-RED',
    role: 'Подписка на MQTT → запись в Supabase',
  },
  {
    icon: Database,
    name: 'Supabase',
    role: 'База данных устройств и телеметрии',
  },
] as const

const MQTT_TOPICS = [
  {
    topic: 'devices/<id>/status',
    direction: 'ESP32 →',
    payload: '{"status":"online"}',
    note: 'retained + LWT',
  },
  {
    topic: 'devices/<id>/telemetry',
    direction: 'ESP32 →',
    payload: '{"uptime":123,"rssi":-60,"heap":40000}',
    note: 'периодически',
  },
  {
    topic: 'devices/<id>/command',
    direction: '→ ESP32',
    payload: '{"action":"relay","value":true}',
    note: 'из админки',
  },
] as const

export function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Cpu className="size-5" />
            </div>
            <div>
              <p className="font-semibold leading-tight">ESP32 Gateway</p>
              <p className="text-xs text-muted-foreground">esp32.kuzyak.in</p>
            </div>
          </div>
          <Button render={<Link href="/login" />} size="sm">
            <LockKeyhole className="size-4" />
            Войти
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-10">
        <section className="mb-12 text-center">
          <Badge variant="secondary" className="mb-4">
            Self-hosted · Raspberry Pi
          </Badge>
          <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            Шлюз управления ESP32
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-pretty text-muted-foreground sm:text-lg">
            Self-hosted панель управления ESP32-устройствами через MQTT — с
            real-time визуализацией статуса и отправкой команд. Разворачивается
            одним <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">docker-compose</code>{' '}
            на Raspberry Pi.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button render={<Link href="/login" />} size="lg">
              Панель управления
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
            <GitBranch className="size-5 text-primary" />
            Архитектура
          </h2>
          <Card>
            <CardContent className="p-0">
              <pre className="overflow-x-auto p-5 font-mono text-xs leading-relaxed text-muted-foreground sm:text-sm">
{`             MQTT (1883)                REST
ESP32  ───────────────────►  Mosquitto ──────► Node-RED ──────► Supabase
  ▲                              ▲                                  │
  │ command                      │ publish command                 │ poll
  └──────────────────────────────┴─────────────  Next.js админка ◄──┘`}
              </pre>
            </CardContent>
          </Card>
          <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
            <li>
              ESP32 публикует <code className="font-mono text-foreground">devices/&lt;id&gt;/status</code> и{' '}
              <code className="font-mono text-foreground">devices/&lt;id&gt;/telemetry</code>.
            </li>
            <li>Node-RED пишет данные в таблицы devices и telemetry в Supabase.</li>
            <li>
              Админка читает Supabase (поллинг) и публикует команды в{' '}
              <code className="font-mono text-foreground">devices/&lt;id&gt;/command</code> напрямую в Mosquitto.
            </li>
          </ul>
        </section>

        <section className="mb-12">
          <h2 className="mb-4 text-lg font-semibold">Стек</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {STACK.map(({ icon: Icon, name, role }) => (
              <Card key={name}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Icon className="size-4 text-primary" />
                    {name}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>{role}</CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="mb-12">
          <h2 className="mb-4 text-lg font-semibold">Формат данных MQTT</h2>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="px-5 py-3 font-medium">Топик</th>
                      <th className="px-5 py-3 font-medium">Направление</th>
                      <th className="px-5 py-3 font-medium">Payload</th>
                    </tr>
                  </thead>
                  <tbody>
                    {MQTT_TOPICS.map((row) => (
                      <tr key={row.topic} className="border-b border-border last:border-0">
                        <td className="px-5 py-3 font-mono text-xs">{row.topic}</td>
                        <td className="px-5 py-3 whitespace-nowrap">{row.direction}</td>
                        <td className="px-5 py-3 font-mono text-xs text-muted-foreground">
                          {row.payload}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </section>

        <section>
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader>
              <CardTitle className="text-base">Панель управления</CardTitle>
              <CardDescription>
                Дашборд с устройствами, телеметрией и отправкой команд доступен
                после входа. Учётные данные задаются переменными ADMIN_USER и
                ADMIN_PASSWORD.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button render={<Link href="/login" />} variant="outline">
                <LockKeyhole className="size-4" />
                Войти в админку
              </Button>
            </CardContent>
          </Card>
        </section>
      </main>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        esp-32-gateway-pi4 · esp32.kuzyak.in
      </footer>
    </div>
  )
}
