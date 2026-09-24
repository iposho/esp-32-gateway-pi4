import type { NextRequest } from 'next/server'
import { safeEqual } from '@/lib/camera-auth'

/** Устройство, которое публикует состояние фламинго в телеметрию */
export function getFlamingoDeviceId(): string {
  return process.env.FLAMINGO_DEVICE_ID || 'esp32-flamingo'
}

/** Ключ в payload телеметрии с состоянием (true/false, 1/0, "on"/"off") */
export function getFlamingoStateKey(): string {
  return process.env.FLAMINGO_STATE_KEY || 'flamingo'
}

export function isValidFlamingoToken(request: NextRequest): boolean {
  const expected = process.env.FLAMINGO_API_TOKEN
  if (!expected) return false

  const auth = request.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return false
  return safeEqual(auth.slice(7), expected)
}

/** Нормализует значение из payload в boolean (undefined — не распознано) */
export function parseOnOff(raw: unknown): boolean | undefined {
  if (typeof raw === 'boolean') return raw
  if (typeof raw === 'number') return raw !== 0
  if (typeof raw === 'string') {
    const l = raw.toLowerCase().trim()
    if (l === 'true' || l === '1' || l === 'on') return true
    if (l === 'false' || l === '0' || l === 'off') return false
  }
  return undefined
}

export type FlamingoStatus = {
  on: boolean
  online: boolean
  changedAt: string | null
  updatedAt: string | null
}
