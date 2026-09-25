'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BrandLogo } from '@/components/brand-logo'

const DASHBOARD_HOME = '/dashboard'

/** Логотип в шапке — всегда ссылка на главную (список устройств) */
export function DashboardHeaderBrand() {
  const pathname = usePathname()

  return (
    <Link
      href={DASHBOARD_HOME}
      aria-label="ESP32 Gateway — к списку устройств"
      aria-current={pathname === DASHBOARD_HOME ? 'page' : undefined}
      className="flex h-9 min-w-0 shrink-0 items-center gap-3 rounded-lg transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <BrandLogo size={36} className="block" />
      <span className="hidden text-base font-semibold text-foreground sm:inline">
        ESP32 Gateway
      </span>
    </Link>
  )
}
