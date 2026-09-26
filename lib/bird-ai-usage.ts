import { gateway } from 'ai'
import { getServiceClient } from '@/lib/supabase/server'
import { BIRD_AI_TAG, getBirdAiModel, isBirdAiEnabled } from '@/lib/bird-ai'
import { dailyLimit, getBirdAiCallsToday } from '@/lib/bird-classifier'
import { getBirdfeederDeviceId } from '@/lib/birdfeeder'

/**
 * Расход модели кормушки в долларах:
 * - остаток и общий расход кредитов команды — gateway.getCredits();
 * - расход по дням именно кормушки (все вызовы, включая неудачные) —
 *   отчёт Gateway по тегу birdfeeder; дни в UTC, данные приходят с задержкой;
 * - средняя цена снимка — bird_detections.cost_usd (scripts/012).
 */

const REPORT_DAYS = 30
const GATEWAY_TTL_MS = 5 * 60_000
const DB_TIMEOUT_MS = 2_000

export type BirdAiUsage = {
  enabled: boolean
  model: string
  dailyLimit: number
  /** Сутки кормушки (BIRDFEEDER_TZ) по счётчику процесса admin: с рестарта — с нуля */
  today: { calls: number; spentUsd: number }
  /** Кредиты всей команды Vercel, не только кормушки */
  balanceUsd: number | null
  totalUsedUsd: number | null
  /** Отчёт Gateway по тегу birdfeeder за 30 дней (UTC), новые дни первыми */
  days: Array<{ day: string; costUsd: number; requests: number }>
  last7Usd: number | null
  last30Usd: number | null
  requests30: number | null
  /** Средняя цена одного снимка (с неудачными попытками) по последним 200 */
  avgPhotoUsd: number | null
  /** На сколько дней хватит остатка при расходе последних 7 дней */
  daysLeft: number | null
  errors: string[]
}

type GatewayPart = Pick<BirdAiUsage, 'balanceUsd' | 'totalUsedUsd' | 'days'> & { errors: string[] }

let gatewayCache: { at: number; value: Promise<GatewayPart> } | null = null

function utcDate(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10)
}

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

async function loadGateway(): Promise<GatewayPart> {
  const [credits, report] = await Promise.allSettled([
    gateway.getCredits(),
    gateway.getSpendReport({
      startDate: utcDate(-(REPORT_DAYS - 1)),
      endDate: utcDate(0),
      groupBy: 'day',
      tags: [BIRD_AI_TAG],
    }),
  ])

  const errors: string[] = []
  const part: GatewayPart = { balanceUsd: null, totalUsedUsd: null, days: [], errors }

  if (credits.status === 'fulfilled') {
    part.balanceUsd = num(credits.value.balance)
    part.totalUsedUsd = num(credits.value.totalUsed)
  } else {
    errors.push(`credits: ${(credits.reason as Error).message}`)
  }

  if (report.status === 'fulfilled') {
    part.days = report.value.results
      .filter((r) => r.day)
      .map((r) => ({ day: r.day!.slice(0, 10), costUsd: r.totalCost, requests: r.requestCount ?? 0 }))
      .sort((a, b) => b.day.localeCompare(a.day))
  } else {
    errors.push(`spend report: ${(report.reason as Error).message}`)
  }
  return part
}

function getGatewayPart(): Promise<GatewayPart> {
  if (!gatewayCache || Date.now() - gatewayCache.at > GATEWAY_TTL_MS) {
    gatewayCache = { at: Date.now(), value: loadGateway() }
  }
  return gatewayCache.value
}

async function avgPhotoUsd(): Promise<number | null> {
  const { data, error } = await getServiceClient()
    .from('bird_detections')
    .select('cost_usd')
    .eq('device_id', getBirdfeederDeviceId())
    .not('cost_usd', 'is', null)
    .order('created_at', { ascending: false })
    .limit(200)
    .abortSignal(AbortSignal.timeout(DB_TIMEOUT_MS))
  if (error) throw new Error(error.message)
  const costs = (data ?? []).map((r) => Number(r.cost_usd)).filter(Number.isFinite)
  return costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : null
}

export async function getBirdAiUsage(): Promise<BirdAiUsage> {
  const base = {
    enabled: isBirdAiEnabled(),
    model: getBirdAiModel(),
    dailyLimit: dailyLimit(),
    today: getBirdAiCallsToday(),
  }
  if (!base.enabled) {
    return {
      ...base,
      balanceUsd: null,
      totalUsedUsd: null,
      days: [],
      last7Usd: null,
      last30Usd: null,
      requests30: null,
      avgPhotoUsd: null,
      daysLeft: null,
      errors: [],
    }
  }

  const [gw, avg] = await Promise.all([
    getGatewayPart(),
    avgPhotoUsd().catch((e: Error) => e),
  ])
  const errors = [...gw.errors]
  if (avg instanceof Error) errors.push(`db: ${avg.message}`)

  const reportOk = !gw.errors.some((e) => e.startsWith('spend report'))
  const since7 = utcDate(-6)
  const last7Usd = reportOk
    ? gw.days.filter((d) => d.day >= since7).reduce((s, d) => s + d.costUsd, 0)
    : null
  const last30Usd = reportOk ? gw.days.reduce((s, d) => s + d.costUsd, 0) : null
  const requests30 = reportOk ? gw.days.reduce((s, d) => s + d.requests, 0) : null
  const perDay = last7Usd !== null ? last7Usd / 7 : null

  return {
    ...base,
    balanceUsd: gw.balanceUsd,
    totalUsedUsd: gw.totalUsedUsd,
    days: gw.days,
    last7Usd,
    last30Usd,
    requests30,
    avgPhotoUsd: avg instanceof Error ? null : avg,
    daysLeft: gw.balanceUsd !== null && perDay ? Math.floor(gw.balanceUsd / perDay) : null,
    errors,
  }
}
