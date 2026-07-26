'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { BrandLogo } from '@/components/brand-logo'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

const GITHUB_REPO = 'https://github.com/iposho/esp-32-gateway-pi4'

const TOC = [
  { id: 'stack', label: 'Стек' },
  { id: 'architecture', label: 'Архитектура' },
  { id: 'mqtt', label: 'MQTT' },
  { id: 'ota', label: 'OTA' },
  { id: 'start', label: 'Быстрый старт' },
] as const

function InlineCode({ children }: { children: ReactNode }) {
  return (
    <code
      className="rounded-md border border-[#d0d7de]/80 bg-[#eff1f3]/90 px-1.5 py-0.5 font-mono text-[85%] text-[#1f2328]"
      translate="no"
    >
      {children}
    </code>
  )
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-xl border border-[#d0d7de]/80 bg-[#1f2328] p-4 text-[13px] leading-relaxed text-[#e6edf3]">
      <code translate="no">{children}</code>
    </pre>
  )
}

function GlassPanel({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-white/70 bg-white/55 shadow-[0_12px_40px_rgba(0,0,0,0.04)] backdrop-blur-xl supports-[backdrop-filter]:bg-white/45',
        className,
      )}
    >
      {children}
    </div>
  )
}

function SectionTitle({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2
      id={id}
      className="mb-4 text-base font-semibold tracking-tight text-[#1f2328]"
    >
      {children}
    </h2>
  )
}

function GhTable({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[#d0d7de]/80 bg-white/75 shadow-sm backdrop-blur-sm">
      <table className="w-full text-left text-xs leading-6 text-[#1f2328]">
        {children}
      </table>
    </div>
  )
}

function LandingReveal({
  children,
  delay = 0,
  eager = false,
}: {
  children: ReactNode
  delay?: number
  eager?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ob = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setShown(true)
          ob.unobserve(el)
        }
      },
      { threshold: 0.08 },
    )
    ob.observe(el)
    return () => ob.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={cn(
        'transition-all duration-700 ease-out',
        shown ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0',
      )}
    >
      {children}
    </div>
  )
}

function NavLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className="block rounded-lg px-2.5 py-1.5 text-xs text-[#656d76] transition-colors hover:bg-black/5 hover:text-[#1f2328]"
    >
      {children}
    </a>
  )
}

function ActionLink({
  href,
  children,
  primary = false,
  external = false,
}: {
  href: string
  children: ReactNode
  primary?: boolean
  external?: boolean
}) {
  const className = cn(
    'inline-flex items-center justify-center rounded-xl px-3.5 py-2 text-xs font-semibold no-underline transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
    primary
      ? 'border border-[#0969da]/30 bg-gradient-to-b from-[#0969da] to-[#044289] text-white shadow-[0_8px_20px_rgba(9,105,218,0.25)] hover:brightness-110 focus-visible:ring-[#0969da]'
      : 'border border-white/80 bg-white/70 text-[#1f2328] shadow-[0_4px_16px_rgba(0,0,0,0.04)] backdrop-blur-md hover:bg-white focus-visible:ring-[#0969da]',
  )

  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      >
        {children}
      </a>
    )
  }

  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  )
}

export function LandingPage() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    if (!supabase) return
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) setIsLoggedIn(true)
    })
  }, [])

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#eef2f7] text-left text-[#1f2328] antialiased [color-scheme:light]">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-24 top-0 size-[28rem] rounded-full bg-[#34d399]/12 blur-3xl" />
        <div className="absolute right-[-10%] top-[18%] size-[22rem] rounded-full bg-[#38bdf8]/14 blur-3xl" />
        <div className="absolute bottom-[-8%] left-[35%] size-[26rem] rounded-full bg-[#0969da]/8 blur-3xl" />
      </div>

      <header className="sticky top-0 z-20 border-b border-white/50 bg-white/60 shadow-[0_8px_32px_rgba(0,0,0,0.04)] backdrop-blur-xl supports-[backdrop-filter]:bg-white/45">
        <div className="mx-auto flex max-w-[1100px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <BrandLogo
              size={32}
              className="rounded-md shadow-[0_8px_20px_rgba(0,0,0,0.08)]"
            />
            <div className="min-w-0">
              <Link
                href="/"
                className="block truncate text-sm font-semibold text-[#1f2328] no-underline transition-colors hover:text-[#0969da] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0969da]/40 focus-visible:ring-offset-2"
                translate="no"
              >
                esp-32-gateway-pi4
              </Link>
              <p className="truncate text-xs text-[#656d76]" translate="no">
                esp32.kuzyak.in
              </p>
            </div>
          </div>
          <nav
            aria-label="Быстрые действия"
            className="flex shrink-0 items-center gap-2"
          >
            <ActionLink href={GITHUB_REPO} external>
              GitHub
            </ActionLink>
            <ActionLink href={isLoggedIn ? "/dashboard" : "/login"} primary>
              {isLoggedIn ? "Панель управления" : "Войти"}
            </ActionLink>
          </nav>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1100px] gap-8 px-4 pb-16 pt-8 sm:px-6 sm:pt-10 lg:gap-10">
        <nav
          aria-label="Разделы документации"
          className="hidden w-44 shrink-0 lg:block"
        >
          <div className="sticky top-24">
            <GlassPanel className="p-3">
              <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#656d76]">
                На странице
              </p>
              <ul className="space-y-0.5">
                {TOC.map((item) => (
                  <li key={item.id}>
                    <NavLink href={`#${item.id}`}>{item.label}</NavLink>
                  </li>
                ))}
              </ul>
            </GlassPanel>
          </div>
        </nav>

        <main id="content" className="min-w-0 flex-1">
          <LandingReveal eager>
            <GlassPanel className="motion-safe:hover:-translate-y-0.5 overflow-hidden p-1.5 motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out motion-reduce:transition-none">
              <figure className="overflow-hidden rounded-[14px]">
                <Image
                  src="/landing-hero.png"
                  alt="Абстрактная композиция ESP32 Gateway"
                  width={1536}
                  height={400}
                  className="h-auto w-full object-cover object-center"
                  priority
                />
              </figure>
            </GlassPanel>
          </LandingReveal>

          <LandingReveal delay={80} eager>
            <div className="mt-8">
              <h1 className="mb-4 border-b border-[#d8dee4]/80 pb-3 text-[2rem] font-semibold leading-tight text-pretty text-[#1f2328] sm:text-[2.25rem]">
                Шлюз управления ESP32 на Raspberry Pi
              </h1>

              <p className="mb-5 max-w-3xl text-base leading-relaxed text-[#1f2328]/90">
                Self-hosted панель управления ESP32-устройствами через MQTT, с
                real-time визуализацией статуса и отправкой команд.
                Разворачивается одним <InlineCode>docker compose</InlineCode> на
                Raspberry Pi.
              </p>

              <div className="mb-8 flex flex-wrap items-center gap-2">
                {['Self-hosted', 'MQTT', 'Raspberry Pi'].map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center rounded-full border border-white/70 bg-white/55 px-2.5 py-0.5 text-xs font-medium text-[#1f2328] shadow-[0_6px_18px_rgba(0,0,0,0.04)] backdrop-blur-sm"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              <div className="flex flex-wrap gap-3">
                <ActionLink href={isLoggedIn ? "/dashboard" : "/login"} primary>
                  {isLoggedIn ? "Перейти в панель" : "Открыть панель"}
                </ActionLink>
                <ActionLink href={GITHUB_REPO} external>
                  GitHub →
                </ActionLink>
              </div>
            </div>
          </LandingReveal>

          <LandingReveal delay={100}>
            <section aria-labelledby="stack" className="mt-10">
              <GlassPanel className="p-5 sm:p-6">
                <SectionTitle id="stack">Стек</SectionTitle>
                <GhTable>
                  <thead>
                    <tr className="bg-[#f6f8fa]/90">
                      <th className="border border-[#d0d7de]/70 px-3 py-2 font-semibold">
                        Компонент
                      </th>
                      <th className="border border-[#d0d7de]/70 px-3 py-2 font-semibold">
                        Роль
                      </th>
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
                      <tr key={name} className="even:bg-[#f6f8fa]/45">
                        <td className="border border-[#d0d7de]/70 px-3 py-2 font-medium">
                          {name}
                        </td>
                        <td className="border border-[#d0d7de]/70 px-3 py-2 text-[#656d76]">
                          {role}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </GhTable>
              </GlassPanel>
            </section>
          </LandingReveal>

          <LandingReveal delay={120}>
            <section aria-labelledby="architecture" className="mt-8">
              <GlassPanel className="p-5 sm:p-6">
                <SectionTitle id="architecture">Архитектура</SectionTitle>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  <figure className="shrink-0 overflow-hidden rounded-xl border border-[#d0d7de]/70 bg-[#f6f8fa]/70 p-4 shadow-[0_12px_28px_rgba(0,0,0,0.05)]">
                    <Image
                      src="/logo.png"
                      alt="Логотип ESP32 Gateway"
                      width={160}
                      height={160}
                      className="h-24 w-24 object-contain sm:h-28 sm:w-28"
                    />
                  </figure>
                  <ul className="list-disc space-y-2 pl-5 text-base leading-relaxed text-[#1f2328]/90">
                    <li>
                      ESP32 публикует <InlineCode>status</InlineCode> и{' '}
                      <InlineCode>telemetry</InlineCode> в MQTT.
                    </li>
                    <li>Node-RED пишет данные в Supabase через PostgREST.</li>
                    <li>
                      Админка читает БД и публикует команды в{' '}
                      <InlineCode>devices/&lt;id&gt;/command</InlineCode>.
                    </li>
                    <li>Telegram-бот — резервный пульт без доступа к Supabase.</li>
                  </ul>
                </div>
              </GlassPanel>
            </section>
          </LandingReveal>

          <LandingReveal delay={140}>
            <section aria-labelledby="mqtt" className="mt-8">
              <GlassPanel className="p-5 sm:p-6">
                <SectionTitle id="mqtt">MQTT-топики</SectionTitle>
                <p className="mb-3 text-base leading-relaxed">
                  Каждое устройство использует свой{' '}
                  <InlineCode>deviceId</InlineCode>:
                </p>
                <GhTable>
                  <thead>
                    <tr className="bg-[#f6f8fa]/90">
                      <th className="border border-[#d0d7de]/70 px-3 py-2 font-semibold">
                        Топик
                      </th>
                      <th className="border border-[#d0d7de]/70 px-3 py-2 font-semibold">
                        Направление
                      </th>
                      <th className="border border-[#d0d7de]/70 px-3 py-2 font-semibold">
                        Payload
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ['devices/<id>/status', 'ESP32 →', '{"status":"online"}'],
                      ['devices/<id>/telemetry', 'ESP32 →', '{"uptime":123,"rssi":-60}'],
                      ['devices/<id>/capabilities', 'ESP32 →', 'retained JSON с командами'],
                      ['devices/<id>/command', '→ ESP32', '{"action":"led","value":true}'],
                    ].map(([topic, dir, payload]) => (
                      <tr key={topic} className="even:bg-[#f6f8fa]/45">
                        <td className="border border-[#d0d7de]/70 px-3 py-2">
                          <InlineCode>{topic}</InlineCode>
                        </td>
                        <td className="border border-[#d0d7de]/70 px-3 py-2 text-[#656d76]">
                          {dir}
                        </td>
                        <td className="border border-[#d0d7de]/70 px-3 py-2">
                          <InlineCode>{payload}</InlineCode>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </GhTable>
              </GlassPanel>
            </section>
          </LandingReveal>

          <LandingReveal delay={160}>
            <section aria-labelledby="ota" className="mt-8">
              <GlassPanel className="p-5 sm:p-6">
                <SectionTitle id="ota">OTA-обновления</SectionTitle>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                  <div className="min-w-0 flex-1">
                    <p className="mb-3 text-base leading-relaxed">
                      В панели нажмите <strong>OTA</strong>, выберите{' '}
                      <InlineCode>.bin</InlineCode> файл. Сервер отправит устройству
                      команду:
                    </p>
                    <CodeBlock>{`{"action":"ota","url":"https://esp32.kuzyak.in/api/firmware/esp32-livingroom_1234567890.bin"}`}</CodeBlock>
                    <p className="mb-3 mt-4 text-base leading-relaxed">
                      Устройство публикует прогресс в телеметрию (по умолчанию
                      включено для новых):
                    </p>
                    <CodeBlock>{`{"ota":"downloading","progress":40}`}</CodeBlock>
                    <p className="mt-3 text-sm leading-relaxed text-[#656d76]">
                      На карточке устройства появляется прогресс-бар. Статусы:{' '}
                      <InlineCode>downloading</InlineCode>,{' '}
                      <InlineCode>writing</InlineCode>,{' '}
                      <InlineCode>success</InlineCode>,{' '}
                      <InlineCode>failed</InlineCode>.
                    </p>
                  </div>
                  <figure className="mx-auto shrink-0 overflow-hidden rounded-xl border border-[#d0d7de]/70 bg-[#f6f8fa]/70 shadow-[0_16px_32px_rgba(0,0,0,0.06)] lg:mx-0 lg:w-44">
                    <Image
                      src="/icon-512.png"
                      alt="Иконка ESP32 Gateway"
                      width={512}
                      height={512}
                      className="h-auto w-full bg-[#f6f8fa]/80 p-6"
                      loading="lazy"
                    />
                  </figure>
                </div>
              </GlassPanel>
            </section>
          </LandingReveal>

          <LandingReveal delay={180}>
            <section aria-labelledby="start" className="mt-8">
              <GlassPanel className="p-5 sm:p-6">
                <SectionTitle id="start">Быстрый старт</SectionTitle>
                <ol className="mb-2 list-decimal space-y-2.5 pl-6 text-base leading-relaxed">
                  <li>
                    Применить <InlineCode>scripts/001_schema.sql</InlineCode> в
                    Supabase
                  </li>
                  <li>
                    Заполнить <InlineCode>.env</InlineCode> и выполнить{' '}
                    <InlineCode>docker compose up -d</InlineCode>
                  </li>
                  <li>
                    Импортировать{' '}
                    <InlineCode>node-red/flows.example.json</InlineCode>
                  </li>
                  <li>
                    Прошить ESP32 примером из{' '}
                    <InlineCode>firmware/esp32-example.ino</InlineCode>
                  </li>
                  <li>
                    <Link
                      href="/login"
                      className="font-medium text-[#0969da] no-underline transition-colors hover:text-[#0550ae] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0969da]/40 focus-visible:ring-offset-2"
                    >
                      Войти в панель управления
                    </Link>
                  </li>
                </ol>
              </GlassPanel>
            </section>
          </LandingReveal>

          <footer className="mt-10 border-t border-[#d8dee4]/80 pt-6 text-sm text-[#656d76]">
            <Link
              href={GITHUB_REPO}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#0969da] no-underline transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0969da]/40 focus-visible:ring-offset-2"
              translate="no"
            >
              iposho/esp-32-gateway-pi4
            </Link>
            {' · '}
            <Link
              href="/login"
              className="text-[#0969da] no-underline transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0969da]/40 focus-visible:ring-offset-2"
            >
              esp32.kuzyak.in
            </Link>
          </footer>
        </main>
      </div>
    </div>
  )
}
