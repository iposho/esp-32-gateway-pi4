import { cn } from '@/lib/utils'

type BrandLogoProps = {
  size?: number
  className?: string
}

export function BrandLogo({ size = 36, className }: BrandLogoProps) {
  return (
    <img
      src="/logo-mark.svg"
      alt=""
      width={size}
      height={size}
      className={cn('shrink-0 rounded-2xl shadow-lg shadow-primary/20', className)}
    />
  )
}
