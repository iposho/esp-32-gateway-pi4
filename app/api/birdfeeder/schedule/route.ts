import { type NextRequest, NextResponse } from 'next/server'
import {
  getLocation,
  getSchedule,
  getSunTimes,
  getWindow,
  inWindow,
  localParts,
  saveSchedule,
} from '@/lib/bird-schedule'
import { minutesToHhmm, parseSchedule } from '@/lib/bird-schedule-shared'

export const dynamic = 'force-dynamic'

/*
 * Часы работы распознавания птиц для дашборда. Путь вне /api/camera:
 * туда пускает CAMERA_API_TOKEN внешнего сайта, а сюда — только вход в админку.
 */

async function state() {
  const location = getLocation()
  const { schedule, stored, error } = await getSchedule()
  const now = localParts(new Date(), location.tz)
  const [window, sun] = await Promise.all([getWindow(now.date, schedule), getSunTimes(now.date)])
  const hm = (iso: string) => minutesToHhmm(localParts(new Date(iso), location.tz).minutes)

  return {
    schedule,
    stored,
    error: error ?? null,
    location,
    today: {
      date: now.date,
      start: window.startMin === null ? null : minutesToHhmm(window.startMin),
      end: window.endMin === null ? null : minutesToHhmm(window.endMin),
      sun: {
        dawn: hm(sun.dawn),
        sunrise: hm(sun.sunrise),
        sunset: hm(sun.sunset),
        dusk: hm(sun.dusk),
        source: sun.source,
      },
    },
    awakeNow: inWindow(now.minutes, window),
  }
}

export type BirdScheduleState = Awaited<ReturnType<typeof state>>

export async function GET() {
  try {
    return NextResponse.json(await state(), { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error('[BirdAI] schedule state failed:', e)
    return NextResponse.json({ error: (e as Error).message }, { status: 503 })
  }
}

/** { schedule: BirdSchedule | null } — null возвращает шаблон по умолчанию */
export async function PUT(req: NextRequest) {
  let body: { schedule?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const schedule = body.schedule === null ? null : parseSchedule(body.schedule)
  if (body.schedule !== null && !schedule) {
    return NextResponse.json({ error: 'Неверное расписание' }, { status: 400 })
  }

  try {
    await saveSchedule(schedule)
    return NextResponse.json(await state())
  } catch (e) {
    console.error('[BirdAI] schedule save failed:', e)
    return NextResponse.json({ error: (e as Error).message }, { status: 503 })
  }
}
