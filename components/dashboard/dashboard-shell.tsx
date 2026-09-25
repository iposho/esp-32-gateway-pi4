'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LogOut, Activity, Radio } from 'lucide-react'
import { DashboardHeaderBrand } from '@/components/dashboard/dashboard-header-brand'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type DashboardShellProps = {
  children: React.ReactNode
  actions?: React.ReactNode
}

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Устройства', icon: Radio, key: 'devices' },
  { href: '/dashboard/traffic', label: 'Трафик', icon: Activity, key: 'traffic' },
] as const

export function DashboardShell({ children, actions }: DashboardShellProps) {
  const pathname = usePathname()
  const router = useRouter()

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.replace('/')
    router.refresh()
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-background/70 backdrop-blur-2xl supports-[backdrop-filter]:bg-background/55">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
            <DashboardHeaderBrand />
            <nav className="flex items-center gap-1 rounded-xl border border-border/60 bg-muted/30 p-1">
              {NAV_ITEMS.map(({ href, label, icon: Icon, key }) => {
                const active =
                  key === 'devices'
                    ? pathname === '/dashboard' || pathname.startsWith('/dashboard/devices')
                    : pathname.startsWith('/dashboard/traffic')
                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors sm:px-3 sm:text-sm',
                      active
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <Icon className="size-3.5" aria-hidden />
                    {label}
                  </Link>
                )
              })}
            </nav>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {actions}
            <Button
              variant="ghost"
              size="sm"
              onClick={logout}
              aria-label="Выйти"
              className="text-muted-foreground hover:text-foreground"
            >
              <LogOut className="size-3.5" />
              <span className="hidden sm:inline">Выход</span>
            </Button>
          </div>
        </div>
      </header>
      {children}
    </div>
  )
}
