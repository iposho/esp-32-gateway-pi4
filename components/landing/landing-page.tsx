import Link from 'next/link'
import { ArrowRight, LockKeyhole } from 'lucide-react'
import { BrandLogo } from '@/components/brand-logo'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export function LandingPage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-black/80">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-3">
            <BrandLogo size={36} className="rounded-md shadow-sm" />
            <div>
              <p className="text-sm font-medium leading-tight">ESP32 Gateway</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">esp32.kuzyak.in</p>
            </div>
          </div>
          <Button render={<Link href="/login" />} size="sm" variant="outline" nativeButton={false} className="border-zinc-200 dark:border-zinc-800">
            <LockKeyhole className="size-4 mr-1.5" />
            Войти
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-20 sm:py-32">
        <section className="text-center">
          <Badge variant="outline" className="mb-6 font-normal border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400">
            Self-hosted · IoT Gateway
          </Badge>
          <h1 className="text-balance text-4xl font-semibold tracking-tight text-zinc-900 dark:text-white sm:text-6xl">
            Управление парком ESP32
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-pretty text-zinc-500 dark:text-zinc-400 sm:text-lg">
            Панель управления для мониторинга устройств и отправки команд в реальном времени.
            Разворачивается в вашей инфраструктуре, работает через MQTT.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Button render={<Link href="/login" />} size="lg" nativeButton={false} className="h-11 px-8 bg-black text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200 transition-colors">
              Панель управления
              <ArrowRight className="size-4 ml-2" />
            </Button>
          </div>
        </section>
      </main>

      <footer className="fixed bottom-0 w-full border-t border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-black py-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
        esp-32-gateway-pi4 · esp32.kuzyak.in
      </footer>
    </div>
  )
}
