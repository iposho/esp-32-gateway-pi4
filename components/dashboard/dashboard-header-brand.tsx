'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BrandLogo } from '@/components/brand-logo'
import { cn } from '@/lib/utils'

const DASHBOARD_HOME = '/dashboard'

export function DashboardHeaderBrand() {
  const pathname = usePathname()
  const isDashboardHome = pathname === DASHBOARD_HOME

  const content = (
    <>
      <BrandLogo size={36} />
      <div className="min-w-0">
        <h1 className="text-base font-semibold leading-tight text-foreground">
          ESP32 Gateway
        </h1>
        <p className="text-xs text-muted-foreground">esp32.kuzyak.in</p>
      </div>
    </>
  )

  if (isDashboardHome) {
    return (
      <div
        className="flex min-w-0 items-center gap-3 rounded-lg"
        aria-current="page"
      >
        {content}
      </div>
    )
  }

  return (
    <Link
      href={DASHBOARD_HOME}
      className={cn(
        'flex min-w-0 items-center gap-3 rounded-lg transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
      )}
    >
      {content}
    </Link>
  )
}
