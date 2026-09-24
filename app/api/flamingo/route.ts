import { type NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase/server'
import {
  getFlamingoDeviceId,
  getFlamingoStateKey,
  isValidFlamingoToken,
  parseOnOff,
  type FlamingoStatus,
} from '@/lib/flamingo'
import { isDeviceActive } from '@/lib/types'

export const dynamic = 'force-dynamic'

/** Сколько последних записей с состоянием смотреть, чтобы найти момент переключения */
const HISTORY_LIMIT = 500
const DB_TIMEOUT_MS = 2_000
/** Короткий кэш в памяти, чтобы не бить в БД на каждый запрос сайта */
const CACHE_TTL_MS = 5_000

let cache: { at: number; data: FlamingoStatus } | null = null
let inflight: Promise<FlamingoStatus> | null = null

function toIso(ts: string | null | undefined): string | null {
  if (!ts) return null
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

async function loadStatus(): Promise<FlamingoStatus> {
  const supabase = getServiceClient()
  const deviceId = getFlamingoDeviceId()
  const key = getFlamingoStateKey()
  const signal = AbortSignal.timeout(DB_TIMEOUT_MS)

  const [deviceRes, latestRes, historyRes] = await Promise.all([
    supabase
      .from('devices')
      .select('last_seen')
      .eq('device_id', deviceId)
      .abortSignal(signal)
      .maybeSingle(),
    supabase
      .from('telemetry')
      .select('created_at')
      .eq('device_id', deviceId)
      .order('created_at', { ascending: false })
      .limit(1)
      .abortSignal(signal)
      .maybeSingle(),
    supabase
      .from('telemetry')
      .select('created_at, value:payload->' + key)
      .eq('device_id', deviceId)
      .not(`payload->${key}`, 'is', null)
      .order('created_at', { ascending: false })
      .limit(HISTORY_LIMIT)
      .abortSignal(signal),
  ])

  const err = deviceRes.error ?? latestRes.error ?? historyRes.error
  if (err) throw new Error(err.message)

  const lastSeen = (deviceRes.data?.last_seen as string | null) ?? null
  const telemetryAt = (latestRes.data?.created_at as string | null) ?? null
  const online = isDeviceActive(lastSeen, telemetryAt)

  const rows = (historyRes.data ?? []) as unknown as Array<{
    created_at: string
    value: unknown
  }>

  let on: boolean | undefined
  let updatedAt: string | null = null
  let changedAt: string | null = null
  let sawChange = false

  // rows отсортированы от новых к старым: идём, пока значение не сменится
  for (const row of rows) {
    const v = parseOnOff(row.value)
    if (v === undefined) continue
    if (on === undefined) {
      on = v
      updatedAt = row.created_at
      changedAt = row.created_at
      continue
    }
    if (v !== on) {
      sawChange = true
      break
    }
    changedAt = row.created_at
  }

  return {
    on: on ?? false,
    online,
    // Если переключения нет в окне истории — точный момент неизвестен
    changedAt: sawChange ? toIso(changedAt) : null,
    updatedAt: toIso(updatedAt),
  }
}

export async function GET(request: NextRequest) {
  if (!isValidFlamingoToken(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const headers = { 'Cache-Control': 'no-store' }

  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return NextResponse.json(cache.data, { headers })
  }

  try {
    inflight ??= loadStatus().finally(() => {
      inflight = null
    })
    const data = await inflight
    cache = { at: Date.now(), data }
    return NextResponse.json(data, { headers })
  } catch (e) {
    console.error('[Flamingo] Failed to load status:', e)
    // Отдаём последнее известное состояние как «не на связи», а не 5xx
    if (cache) {
      return NextResponse.json({ ...cache.data, online: false }, { headers })
    }
    return NextResponse.json(
      { error: 'status unavailable' },
      { status: 503, headers },
    )
  }
}
