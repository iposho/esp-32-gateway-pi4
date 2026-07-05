'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import { RefreshCw } from 'lucide-react'
import { DashboardShell } from '@/components/dashboard/dashboard-shell'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EventFeed } from '@/components/traffic/event-feed'
import { EventFilters } from '@/components/traffic/event-filters'
import { TrafficStatsBar } from '@/components/traffic/traffic-stats-bar'
import { createClient } from '@/lib/supabase/client'
import type { MqttEvent, MqttEventType } from '@/lib/mqtt-events'
import type { Device } from '@/lib/types'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const MAX_EVENTS = 500

type EventsResponse = { events: MqttEvent[] }
type StatsResponse = {
  total: number
  messages_per_minute: number
  by_type: Record<MqttEventType, number>
}
type DevicesResponse = { devices: Device[] }

function buildEventsUrl(filters: {
  deviceId: string
  eventType: MqttEventType | ''
  before?: string
}) {
  const params = new URLSearchParams({ limit: '100' })
  if (filters.deviceId) params.set('device_id', filters.deviceId)
  if (filters.eventType) params.set('event_type', filters.eventType)
  if (filters.before) params.set('before', filters.before)
  return `/api/mqtt/events?${params.toString()}`
}

export function TrafficDashboard() {
  const [deviceId, setDeviceId] = useState('')
  const [eventType, setEventType] = useState<MqttEventType | ''>('')
  const [topicSearch, setTopicSearch] = useState('')
  const [paused, setPaused] = useState(false)
  const [events, setEvents] = useState<MqttEvent[]>([])
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const seenIds = useRef(new Set<number>())

  const eventsUrl = buildEventsUrl({ deviceId, eventType })

  const {
    data: eventsData,
    error: eventsError,
    isLoading: eventsLoading,
    mutate: mutateEvents,
  } = useSWR<EventsResponse>(eventsUrl, fetcher, {
    refreshInterval: paused ? 0 : 2000,
    keepPreviousData: true,
  })

  const { data: statsData, isLoading: statsLoading } = useSWR<StatsResponse>(
    '/api/mqtt/stats',
    fetcher,
    { refreshInterval: paused ? 0 : 10000 },
  )

  const { data: devicesData } = useSWR<DevicesResponse>('/api/devices', fetcher, {
    refreshInterval: 30000,
  })

  const deviceOptions = useMemo(
    () => (devicesData?.devices ?? []).map((d) => d.device_id).sort(),
    [devicesData],
  )

  useEffect(() => {
    if (!eventsData?.events) return
    seenIds.current = new Set(eventsData.events.map((e) => e.id))
    setEvents(eventsData.events)
    setHasMore(eventsData.events.length >= 100)
  }, [eventsData])

  useEffect(() => {
    if (paused) return

    const supabase = createClient()
    const channel = supabase
      .channel('mqtt_events_live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'mqtt_events' },
        (payload) => {
          const row = payload.new as MqttEvent
          if (deviceId && row.device_id !== deviceId) return
          if (eventType && row.event_type !== eventType) return
          if (seenIds.current.has(row.id)) return
          seenIds.current.add(row.id)
          setEvents((prev) => [row, ...prev].slice(0, MAX_EVENTS))
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [paused, deviceId, eventType])

  const loadMore = useCallback(async () => {
    if (loadingMore || events.length === 0) return
    const oldest = events[events.length - 1]?.created_at
    if (!oldest) return

    setLoadingMore(true)
    try {
      const url = buildEventsUrl({ deviceId, eventType, before: oldest })
      const res = await fetch(url)
      const data: EventsResponse = await res.json()
      const older = data.events ?? []
      setHasMore(older.length >= 100)
      setEvents((prev) => {
        const merged = [...prev]
        for (const e of older) {
          if (!seenIds.current.has(e.id)) {
            seenIds.current.add(e.id)
            merged.push(e)
          }
        }
        return merged.slice(0, MAX_EVENTS)
      })
    } finally {
      setLoadingMore(false)
    }
  }, [deviceId, eventType, events, loadingMore])

  const clearFilters = useCallback(() => {
    setDeviceId('')
    setEventType('')
    setTopicSearch('')
  }, [])

  return (
    <DashboardShell
      actions={
        <Button
          variant="ghost"
          size="sm"
          onClick={() => mutateEvents()}
          className="text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className={`size-3.5 ${eventsLoading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Обновить</span>
        </Button>
      }
    >
      <main className="mx-auto max-w-7xl px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-8">
        <div className="mb-6">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Мониторинг
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            MQTT-трафик
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Live-лента всех сообщений через Mosquitto · {paused ? 'пауза' : 'live'}
          </p>
        </div>

        <div className="mb-6">
          <TrafficStatsBar stats={statsData ?? null} loading={statsLoading} />
        </div>

        {eventsError && (
          <Card className="mb-6 border-destructive/20 bg-destructive/10">
            <CardContent className="flex px-4 py-3 text-sm text-destructive">
              Не удалось загрузить события. Проверьте, что применена миграция{' '}
              <code className="mx-1">004_mqtt_events.sql</code>.
            </CardContent>
          </Card>
        )}

        <div className="mb-4">
          <EventFilters
            deviceId={deviceId}
            eventType={eventType}
            topicSearch={topicSearch}
            paused={paused}
            deviceOptions={deviceOptions}
            onDeviceChange={setDeviceId}
            onEventTypeChange={setEventType}
            onTopicSearchChange={setTopicSearch}
            onPausedChange={setPaused}
            onClearFilters={clearFilters}
          />
        </div>

        <EventFeed
          events={events}
          topicSearch={topicSearch}
          loading={eventsLoading}
          onDeviceClick={setDeviceId}
          onLoadMore={loadMore}
          hasMore={hasMore}
          loadingMore={loadingMore}
        />
      </main>
    </DashboardShell>
  )
}
