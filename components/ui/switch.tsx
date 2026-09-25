'use client'

import { cn } from '@/lib/utils'

/** Переключатель вкл/выкл (role="switch") */
export function Switch({
  checked,
  onCheckedChange,
  disabled,
  className,
  ...props
}: {
  checked: boolean
  onCheckedChange?: (checked: boolean) => void
  disabled?: boolean
  className?: string
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'>) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onCheckedChange?.(!checked)
      }}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors outline-none',
        'focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-emerald-500' : 'bg-muted-foreground/25',
        className,
      )}
      {...props}
    >
      <span
        aria-hidden
        className={cn(
          'pointer-events-none block size-5 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200',
          checked ? 'translate-x-[1.3rem]' : 'translate-x-0.5',
        )}
      />
    </button>
  )
}
