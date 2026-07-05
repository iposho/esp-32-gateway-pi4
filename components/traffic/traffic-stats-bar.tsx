'use client'

import { MQTT_EVENT_TYPES, EVENT_TYPE_LABELS, type MqttEventType } from '@/lib/mqtt-events'
import { cn } from '@/lib/utils'

type TrafficStats = {
  total: number
  messages_per_minute: number
  by_type: Record<MqttEventType, number>
}

type TrafficStatsBarProps = {
  stats: TrafficStats | null
  loading?: boolean
}

const TYPE_COLORS: Record<MqttEventType, string> = {
  status: 'text-emerald-600 dark:text-emerald-400',
  telemetry: 'text-muted-foreground',
  capabilities: 'text-blue-600 dark:text-blue-400',
  command: 'text-amber-600 dark:text-amber-400',
  out: 'text-violet-600 dark:text-violet-400',
  other: 'text-muted-foreground/70',
}

export function TrafficStatsBar({ stats, loading }: TrafficStatsBarProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <StatPill label="За час" value={stats?.total ?? 0} loading={loading} />
      <StatPill
        label="Сообщ/мин"
        value={stats?.messages_per_minute ?? 0}
        loading={loading}
        decimal
      />
      {MQTT_EVENT_TYPES.map((type) => (
        <StatPill
          key={type}
          label={EVENT_TYPE_LABELS[type]}
          value={stats?.by_type[type] ?? 0}
          loading={loading}
          className={TYPE_COLORS[type]}
        />
      ))}
    </div>
  )
}

function StatPill({
  label,
  value,
  loading,
  decimal,
  className,
}: {
  label: string
  value: number
  loading?: boolean
  decimal?: boolean
  className?: string
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/50 px-3 py-2.5 sm:px-4">
      <p className="truncate text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground sm:text-xs">
        {label}
      </p>
      <p
        className={cn(
          'mt-0.5 text-xl font-semibold tabular-nums tracking-tight sm:text-2xl',
          className ?? 'text-foreground',
        )}
      >
        {loading ? '…' : decimal ? value.toFixed(1) : value.toLocaleString('ru-RU')}
      </p>
    </div>
  )
}
