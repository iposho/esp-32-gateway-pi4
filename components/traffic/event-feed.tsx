'use client'

import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { EVENT_TYPE_LABELS, type MqttEvent, type MqttEventType } from '@/lib/mqtt-events'
import { cn } from '@/lib/utils'

type EventFeedProps = {
  events: MqttEvent[]
  topicSearch: string
  loading?: boolean
  onDeviceClick: (deviceId: string) => void
  onLoadMore?: () => void
  hasMore?: boolean
  loadingMore?: boolean
}

const TYPE_VARIANT: Record<MqttEventType, 'online' | 'secondary' | 'outline' | 'default' | 'stale'> = {
  status: 'online',
  telemetry: 'secondary',
  capabilities: 'outline',
  command: 'default',
  out: 'stale',
  other: 'secondary',
}

const COLLAPSE_THRESHOLD = 4096

export function EventFeed({
  events,
  topicSearch,
  loading,
  onDeviceClick,
  onLoadMore,
  hasMore,
  loadingMore,
}: EventFeedProps) {
  const filtered = useMemo(() => {
    const q = topicSearch.trim().toLowerCase()
    if (!q) return events
    return events.filter((e) => e.topic.toLowerCase().includes(q))
  }, [events, topicSearch])

  if (loading && events.length === 0) {
    return (
      <Card className="border-dashed bg-card/50 shadow-none">
        <CardContent className="py-16 text-center text-sm text-muted-foreground">
          Загрузка событий…
        </CardContent>
      </Card>
    )
  }

  if (filtered.length === 0) {
    return (
      <Card className="border-dashed bg-card/50 shadow-none">
        <CardContent className="py-16 text-center">
          <p className="font-medium text-foreground">Событий пока нет</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Когда через Mosquitto пройдёт MQTT-сообщение, Node-RED запишет его в audit log.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-2">
      {filtered.map((event) => (
        <EventRow key={event.id} event={event} onDeviceClick={onDeviceClick} />
      ))}
      {hasMore && onLoadMore && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            className="rounded-xl border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:opacity-50"
          >
            {loadingMore ? 'Загрузка…' : 'Загрузить ещё'}
          </button>
        </div>
      )}
    </div>
  )
}

function EventRow({
  event,
  onDeviceClick,
}: {
  event: MqttEvent
  onDeviceClick: (deviceId: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const large = event.payload_size > COLLAPSE_THRESHOLD
  const showPayload = !large || expanded
  const payloadText = JSON.stringify(event.payload, null, 2)
  const time = new Date(event.created_at).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

  return (
    <Card className="overflow-hidden py-0 shadow-none">
      <CardContent className="p-0">
        <div className="flex flex-wrap items-start gap-2 border-b border-border/50 px-3 py-2.5 sm:px-4">
          <Badge variant={TYPE_VARIANT[event.event_type] ?? 'secondary'}>
            {EVENT_TYPE_LABELS[event.event_type]}
          </Badge>
          {event.device_id && (
            <button
              type="button"
              onClick={() => onDeviceClick(event.device_id!)}
              className="rounded-md bg-muted/60 px-2 py-0.5 font-mono text-xs text-foreground hover:bg-muted"
            >
              {event.device_id}
            </button>
          )}
          <code className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
            {event.topic}
          </code>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{time}</span>
          {event.payload_size > 0 && (
            <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/70">
              {formatBytes(event.payload_size)}
            </span>
          )}
        </div>
        <div className="px-3 py-2 sm:px-4">
          {large && !expanded ? (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ChevronRight className="size-3.5" />
              Payload {formatBytes(event.payload_size)} — нажмите, чтобы развернуть
            </button>
          ) : (
            <>
              {large && (
                <button
                  type="button"
                  onClick={() => setExpanded(false)}
                  className="mb-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <ChevronDown className="size-3.5" />
                  Свернуть
                </button>
              )}
              {showPayload && (
                <pre
                  className={cn(
                    'overflow-x-auto rounded-lg bg-muted/40 p-2.5 font-mono text-[11px] leading-relaxed text-foreground/90',
                    large && 'max-h-96',
                  )}
                >
                  {payloadText}
                </pre>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  return `${(kb / 1024).toFixed(1)} MB`
}
