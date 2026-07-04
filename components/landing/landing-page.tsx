import Image from 'next/image'
import Link from 'next/link'
import { BrandLogo } from '@/components/brand-logo'

const GITHUB_REPO = 'https://github.com/iposho/esp-32-gateway-pi4'

function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-md border border-[#d0d7de] bg-[#eff1f3] px-1.5 py-0.5 font-mono text-[85%] text-[#1f2328]">
      {children}
    </code>
  )
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-md border border-[#d0d7de] bg-[#f6f8fa] px-4 py-3 font-mono text-[13px] leading-relaxed text-[#1f2328]">
      <code>{children}</code>
    </pre>
  )
}

function SectionTitle({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <h2
      id={id}
      className="mb-4 mt-8 border-b border-[#d8dee4] pb-2 text-2xl font-semibold text-[#1f2328] first:mt-0"
    >
      {children}
    </h2>
  )
}

function GhTable({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">{children}</table>
    </div>
  )
}

export function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-left text-[#1f2328] antialiased">
      <header className="sticky top-0 z-10 border-b border-[#d0d7de] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1012px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <BrandLogo size={32} className="rounded-md shadow-none" />
            <div className="min-w-0">
              <Link
                href="/"
                className="block truncate text-sm font-semibold text-[#1f2328] no-underline hover:text-[#0969da]"
              >
                esp-32-gateway-pi4
              </Link>
              <p className="truncate text-xs text-[#656d76]">esp32.kuzyak.in</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href={GITHUB_REPO}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-md border border-[#d0d7de] bg-[#f6f8fa] px-3 py-1.5 text-sm font-medium text-[#1f2328] no-underline transition-colors hover:bg-[#eff1f3]"
            >
              GitHub
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center rounded-md border border-[#d0d7de] bg-[#f6f8fa] px-3 py-1.5 text-sm font-medium text-[#1f2328] no-underline transition-colors hover:bg-[#eff1f3]"
            >
              Войти
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1012px] px-4 py-8 sm:px-6 sm:py-10">
        <figure className="mb-6 overflow-hidden rounded-lg">
          <Image
            src="/landing-hero.png"
            alt="Абстрактная композиция ESP32 Gateway"
            width={1536}
            height={400}
            className="h-auto w-full object-cover object-center"
            priority
          />
        </figure>

        <h1 className="mb-4 border-b border-[#d8dee4] pb-2 text-[2rem] font-semibold leading-tight text-[#1f2328]">
          Шлюз управления ESP32 на Raspberry Pi
        </h1>

        <p className="mb-4 max-w-3xl text-base leading-relaxed text-[#1f2328]">
          Self-hosted панель управления ESP32-устройствами через MQTT, с real-time
          визуализацией статуса и отправкой команд. Разворачивается одним{' '}
          <InlineCode>docker compose</InlineCode> на Raspberry Pi.
        </p>

        <div className="mb-8 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-full border border-[#d0d7de] bg-[#f6f8fa] px-2.5 py-0.5 text-xs font-medium text-[#1f2328]">
            Self-hosted
          </span>
          <span className="inline-flex items-center rounded-full border border-[#d0d7de] bg-[#f6f8fa] px-2.5 py-0.5 text-xs font-medium text-[#1f2328]">
            MQTT
          </span>
          <span className="inline-flex items-center rounded-full border border-[#d0d7de] bg-[#f6f8fa] px-2.5 py-0.5 text-xs font-medium text-[#1f2328]">
            Raspberry Pi
          </span>
          <Link
            href={GITHUB_REPO}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-[#0969da] no-underline hover:underline"
          >
            GitHub →
          </Link>
          <Link
            href="/login"
            className="text-sm font-medium text-[#0969da] no-underline hover:underline"
          >
            Открыть панель →
          </Link>
        </div>

        <SectionTitle id="stack">Стек</SectionTitle>
        <GhTable>
          <thead>
            <tr className="bg-[#f6f8fa]">
              <th className="border border-[#d0d7de] px-3 py-2 font-semibold">Компонент</th>
              <th className="border border-[#d0d7de] px-3 py-2 font-semibold">Роль</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Next.js 16 (TS)', 'Админка: вход, дашборд, команды, OTA'],
              ['Mosquitto', 'MQTT-брокер (ESP32 ↔ бэкенд)'],
              ['Node-RED', 'Подписка на MQTT → запись в Supabase'],
              ['Telegram bot', 'Резервное управление через MQTT'],
              ['Supabase', 'БД: устройства, телеметрия, аудит команд'],
            ].map(([name, role]) => (
              <tr key={name} className="even:bg-[#f6f8fa]/50">
                <td className="border border-[#d0d7de] px-3 py-2 font-medium">{name}</td>
                <td className="border border-[#d0d7de] px-3 py-2 text-[#656d76]">{role}</td>
              </tr>
            ))}
          </tbody>
        </GhTable>

        <SectionTitle id="architecture">Архитектура</SectionTitle>
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-start">
          <figure className="shrink-0 overflow-hidden rounded-md border border-[#d0d7de] bg-[#f6f8fa] p-4">
            <Image
              src="/logo.png"
              alt="ESP32 Gateway"
              width={160}
              height={160}
              className="h-24 w-24 object-contain sm:h-28 sm:w-28"
            />
          </figure>
          <ul className="list-disc space-y-2 pl-5 text-base leading-relaxed text-[#1f2328]">
            <li>ESP32 публикует <InlineCode>status</InlineCode> и <InlineCode>telemetry</InlineCode> в MQTT.</li>
            <li>Node-RED пишет данные в Supabase через PostgREST.</li>
            <li>Админка читает БД и публикует команды в <InlineCode>devices/&lt;id&gt;/command</InlineCode>.</li>
            <li>Telegram-бот — резервный пульт без доступа к Supabase.</li>
          </ul>
        </div>

        <SectionTitle id="mqtt">MQTT-топики</SectionTitle>
        <p className="mb-3 text-base leading-relaxed">
          Каждое устройство использует свой <InlineCode>deviceId</InlineCode>:
        </p>
        <GhTable>
          <thead>
            <tr className="bg-[#f6f8fa]">
              <th className="border border-[#d0d7de] px-3 py-2 font-semibold">Топик</th>
              <th className="border border-[#d0d7de] px-3 py-2 font-semibold">Направление</th>
              <th className="border border-[#d0d7de] px-3 py-2 font-semibold">Payload</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['devices/<id>/status', 'ESP32 →', '{"status":"online"}'],
              ['devices/<id>/telemetry', 'ESP32 →', '{"uptime":123,"rssi":-60}'],
              ['devices/<id>/capabilities', 'ESP32 →', 'retained JSON с командами'],
              ['devices/<id>/command', '→ ESP32', '{"action":"led","value":true}'],
            ].map(([topic, dir, payload]) => (
              <tr key={topic} className="even:bg-[#f6f8fa]/50">
                <td className="border border-[#d0d7de] px-3 py-2">
                  <InlineCode>{topic}</InlineCode>
                </td>
                <td className="border border-[#d0d7de] px-3 py-2 text-[#656d76]">{dir}</td>
                <td className="border border-[#d0d7de] px-3 py-2">
                  <InlineCode>{payload}</InlineCode>
                </td>
              </tr>
            ))}
          </tbody>
        </GhTable>

        <SectionTitle id="ota">OTA-обновления</SectionTitle>
        <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1">
            <p className="mb-3 text-base leading-relaxed">
              В панели нажмите <strong>OTA</strong>, выберите <InlineCode>.bin</InlineCode> файл.
              Сервер отправит устройству команду:
            </p>
            <CodeBlock>{`{"action":"ota","url":"https://esp32.kuzyak.in/api/firmware/esp32-livingroom_1234567890.bin"}`}</CodeBlock>
            <p className="mb-3 mt-4 text-base leading-relaxed">
              Устройство публикует прогресс в телеметрию (по умолчанию включено для новых):
            </p>
            <CodeBlock>{`{"ota":"downloading","progress":40}`}</CodeBlock>
          </div>
          <figure className="shrink-0 overflow-hidden rounded-md border border-[#d0d7de] lg:w-48">
            <Image
              src="/icon-512.png"
              alt="ESP32 Gateway icon"
              width={512}
              height={512}
              className="h-auto w-full bg-[#f6f8fa] p-6"
            />
          </figure>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-[#656d76]">
          На карточке устройства появляется прогресс-бар. Статусы:{' '}
          <InlineCode>downloading</InlineCode>, <InlineCode>writing</InlineCode>,{' '}
          <InlineCode>success</InlineCode>, <InlineCode>failed</InlineCode>.
        </p>

        <SectionTitle id="start">Быстрый старт</SectionTitle>
        <ol className="mb-6 list-decimal space-y-2 pl-6 text-base leading-relaxed">
          <li>
            Применить <InlineCode>scripts/001_schema.sql</InlineCode> в Supabase
          </li>
          <li>
            Заполнить <InlineCode>.env</InlineCode> и выполнить{' '}
            <InlineCode>docker compose up -d</InlineCode>
          </li>
          <li>
            Импортировать <InlineCode>node-red/flows.example.json</InlineCode>
          </li>
          <li>
            Прошить ESP32 примером из <InlineCode>firmware/esp32-example.ino</InlineCode>
          </li>
          <li>
            <Link href="/login" className="font-medium text-[#0969da] no-underline hover:underline">
              Войти в панель управления
            </Link>
          </li>
        </ol>

        <footer className="border-t border-[#d8dee4] pt-6 text-sm text-[#656d76]">
          <Link
            href={GITHUB_REPO}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#0969da] no-underline hover:underline"
          >
            iposho/esp-32-gateway-pi4
          </Link>
          {' · '}
          <Link href="/login" className="text-[#0969da] no-underline hover:underline">
            esp32.kuzyak.in
          </Link>
        </footer>
      </main>
    </div>
  )
}
