/**
 * Часы работы распознавания птиц: типы, шаблоны и проверка.
 * Без серверных зависимостей — импортируется и в дашборд.
 */

export type BirdSchedule =
  | {
      /** Окно по солнцу: от рассвета до заката в городе кормушки */
      mode: 'sun'
      /** civil — от начала утренних до конца вечерних гражданских сумерек; sun — восход и закат */
      edge: 'civil' | 'sun'
      /** Сдвиг начала, мин: −30 — на полчаса раньше */
      startOffsetMin: number
      /** Сдвиг конца, мин: +30 — на полчаса позже */
      endOffsetMin: number
    }
  | {
      /** Фиксированные часы по местному времени; start > end — окно через полночь */
      mode: 'fixed'
      start: string
      end: string
    }
  | { mode: 'always' }

export const SCHEDULE_PRESETS: Array<{ id: string; title: string; schedule: BirdSchedule }> = [
  {
    id: 'civil',
    title: 'По солнцу, с сумерками',
    schedule: { mode: 'sun', edge: 'civil', startOffsetMin: 0, endOffsetMin: 0 },
  },
  {
    id: 'sun',
    title: 'От восхода до заката',
    schedule: { mode: 'sun', edge: 'sun', startOffsetMin: 0, endOffsetMin: 0 },
  },
  {
    id: 'sun-30',
    title: 'Восход −30 мин … закат +30 мин',
    schedule: { mode: 'sun', edge: 'sun', startOffsetMin: -30, endOffsetMin: 30 },
  },
  {
    id: '6-20',
    title: '06:00–20:00',
    schedule: { mode: 'fixed', start: '06:00', end: '20:00' },
  },
  {
    id: '7-19',
    title: '07:00–19:00',
    schedule: { mode: 'fixed', start: '07:00', end: '19:00' },
  },
  { id: 'always', title: 'Круглосуточно', schedule: { mode: 'always' } },
]

export const DEFAULT_SCHEDULE: BirdSchedule = SCHEDULE_PRESETS[0].schedule

const MAX_OFFSET_MIN = 180
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

/** Нормализованное расписание или null, если данные не подходят */
export function parseSchedule(raw: unknown): BirdSchedule | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>

  if (r.mode === 'always') return { mode: 'always' }

  if (r.mode === 'fixed') {
    if (typeof r.start !== 'string' || typeof r.end !== 'string') return null
    if (!TIME_RE.test(r.start) || !TIME_RE.test(r.end) || r.start === r.end) return null
    return { mode: 'fixed', start: r.start, end: r.end }
  }

  if (r.mode === 'sun') {
    if (r.edge !== 'civil' && r.edge !== 'sun') return null
    const offset = (v: unknown) =>
      typeof v === 'number' && Number.isInteger(v) && Math.abs(v) <= MAX_OFFSET_MIN ? v : null
    const startOffsetMin = offset(r.startOffsetMin ?? 0)
    const endOffsetMin = offset(r.endOffsetMin ?? 0)
    if (startOffsetMin === null || endOffsetMin === null) return null
    return { mode: 'sun', edge: r.edge, startOffsetMin, endOffsetMin }
  }

  return null
}

export function sameSchedule(a: BirdSchedule, b: BirdSchedule): boolean {
  return JSON.stringify(parseSchedule(a)) === JSON.stringify(parseSchedule(b))
}

export function findPreset(schedule: BirdSchedule): string | null {
  return SCHEDULE_PRESETS.find((p) => sameSchedule(p.schedule, schedule))?.id ?? null
}

export function minutesToHhmm(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}
