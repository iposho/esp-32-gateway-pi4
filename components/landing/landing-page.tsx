'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { BrandLogo } from '@/components/brand-logo'
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
    <pre className="overflow-x-auto rounded-xl border border-[#d0d7de]/80 bg-[#f6f8fa]/80 px-4 py-3 font-mono text-[13px] leading-relaxed text-[#1f2328] backdrop-blur-sm">
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
        'rounded-2xl border border-white/70 bg-white/50 shadow-[0_20px_40px_rgba(0,0,0,0.06)] backdrop-blur-xl',
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
      className="scroll-mt-24 mb-4 border-b border-[#d8dee4]/80 pb-2 text-2xl font-semibold text-pretty text-[#1f2328]"
    >
      {children}
    </h2>
  )
}

function GhTable({ children }: { children: ReactNode }) {
  return (
    <div className="mb-4 overflow-x-auto overscroll-x-contain rounded-xl border border-[#d0d7de]/70">
      <table className="w-full min-w-[480px] border-collapse text-left text-sm">
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
  const [visible, setVisible] = useState(eager)

  useEffect(() => {
    if (eager) return

    const el = ref.current
    if (!el) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      setVisible(true)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.08, rootMargin: '0px 0px -5% 0px' },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [eager])

  return (
    <div
      ref={ref}
      className={cn(
        'motion-safe:transition-[opacity,transform] motion-safe:duration-700 motion-safe:ease-out motion-reduce:transition-none',
        visible
          ? 'translate-y-0 opacity-100'
          : 'translate-y-5 opacity-0 motion-reduce:translate-y-0 motion-reduce:opacity-100',
      )}
      style={{ transitionDelay: visible ? `${delay}ms` : '0ms' }}
    >
      {children}
    </div>
  )
}

function NavLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className="block rounded-lg px-2 py-1.5 text-sm text-[#656d76] no-underline transition-colors hover:bg-white/60 hover:text-[#0969da] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0969da]/40"
    >
      {children}
    </a>
  )
}

function ActionLink({
  href,
  children,
  external = false,
  primary = false,
}: {
  href: string
  children: ReactNode
  external?: boolean
  primary?: boolean
}) {
  const className = cn(
    'inline-flex touch-manipulation items-center rounded-xl border px-3.5 py-2 text-sm font-medium no-underline',
    'transition-[background-color,border-color,color,box-shadow] duration-300 ease-out',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0969da]/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f6f8fa]',
    primary
      ? 'border-[#0969da]/30 bg-[#0969da] text-white shadow-[0_12px_28px_rgba(9,105,218,0.22)] hover:bg-[#0550ae]'
      : 'border-[#d0d7de]/80 bg-white/55 text-[#1f2328] shadow-[0_8px_24px_rgba(0,0,0,0.04)] backdrop-blur-sm hover:border-[#0969da]/25 hover:bg-white/80',
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
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#eef2f7] text-left text-[#1f2328] antialiased [color-scheme:light]">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-24 top-0 size-[28rem] rounded-full bg-[#34d399]/12 blur-3xl" />
        <div className="absolute right-[-10%] top-[18%] size-[22rem] rounded-full bg-[#38bdf8]/14 blur-3xl" />
        <div className="absolute bottom-[-8%] left-[35%] size-[26rem] rounded-full bg-[#0969da]/8 blur-3xl" />
      </div>

      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-[#0969da] focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-[#0969da]/40"
      >
        Перейти к содержимому
      </a>

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
            <ActionLink href="/login" primary>
              Войти
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
                <ActionLink href="/login" primary>
                  Открыть панель
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
