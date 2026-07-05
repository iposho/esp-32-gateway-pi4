'use client'

import { Pause, Play, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MQTT_EVENT_TYPES, EVENT_TYPE_LABELS, type MqttEventType } from '@/lib/mqtt-events'
import { cn } from '@/lib/utils'

type EventFiltersProps = {
  deviceId: string
  eventType: MqttEventType | ''
  topicSearch: string
  paused: boolean
  deviceOptions: string[]
  onDeviceChange: (value: string) => void
  onEventTypeChange: (value: MqttEventType | '') => void
  onTopicSearchChange: (value: string) => void
  onPausedChange: (paused: boolean) => void
  onClearFilters: () => void
}

const CHIP_COLORS: Record<MqttEventType, string> = {
  status: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  telemetry: 'border-border bg-muted/50 text-muted-foreground',
  capabilities: 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300',
  command: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  out: 'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  other: 'border-border bg-muted/30 text-muted-foreground',
}

export function EventFilters({
  deviceId,
  eventType,
  topicSearch,
  paused,
  deviceOptions,
  onDeviceChange,
  onEventTypeChange,
  onTopicSearchChange,
  onPausedChange,
  onClearFilters,
}: EventFiltersProps) {
  const hasFilters = Boolean(deviceId || eventType || topicSearch)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={deviceId}
          onChange={(e) => onDeviceChange(e.target.value)}
          className="h-9 rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <option value="">Все устройства</option>
          {deviceOptions.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>

        <Button
          variant={paused ? 'default' : 'outline'}
          size="sm"
          onClick={() => onPausedChange(!paused)}
          className="gap-1.5"
        >
          {paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
          {paused ? 'Продолжить' : 'Пауза'}
        </Button>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={onClearFilters} className="gap-1.5">
            <X className="size-3.5" />
            Сбросить
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <FilterChip
          label="Все"
          active={!eventType}
          onClick={() => onEventTypeChange('')}
        />
        {MQTT_EVENT_TYPES.map((type) => (
          <FilterChip
            key={type}
            label={EVENT_TYPE_LABELS[type]}
            active={eventType === type}
            className={eventType === type ? CHIP_COLORS[type] : undefined}
            onClick={() => onEventTypeChange(eventType === type ? '' : type)}
          />
        ))}
      </div>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={topicSearch}
          onChange={(e) => onTopicSearchChange(e.target.value)}
          placeholder="Поиск по topic…"
          className="pl-9"
        />
      </div>
    </div>
  )
}

function FilterChip({
  label,
  active,
  onClick,
  className,
}: {
  label: string
  active: boolean
  onClick: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
        active
          ? className ?? 'border-primary/30 bg-primary/10 text-primary'
          : 'border-border bg-muted/20 text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
    </button>
  )
}
