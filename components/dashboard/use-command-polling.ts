'use client'

import { useCallback, useRef } from 'react'
import { useSWRConfig } from 'swr'
import type { SendCommand } from './device-controls'

/** Обычный интервал опроса и ускоренный — сразу после отправки команды */
const REFRESH_MS = 3000
const FAST_REFRESH_MS = 700
const FAST_REFRESH_WINDOW_MS = 8000
/** Дозапросы сразу после команды — устройство обычно отвечает за доли секунды */
const FOLLOW_UP_MS = [300, 800, 1500]

/**
 * Отправка команды устройству + ускоренный опрос SWR на несколько секунд,
 * чтобы ответ устройства (новая телеметрия) появился почти сразу.
 */
export function useCommandPolling(swrKey: string | null) {
  const { mutate } = useSWRConfig()
  const fastUntilRef = useRef(0)

  const refreshInterval = useCallback(
    () => (Date.now() < fastUntilRef.current ? FAST_REFRESH_MS : REFRESH_MS),
    [],
  )

  const sendCommand: SendCommand = useCallback(
    async (deviceId, payload) => {
      const res = await fetch('/api/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, payload }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? 'Не удалось отправить команду')
      }
      fastUntilRef.current = Date.now() + FAST_REFRESH_WINDOW_MS
      // Таймер refreshInterval уже взведён на 3 с и внеочередной mutate его
      // не сбрасывает — поэтому сами дёргаем обновление в первые секунды
      if (swrKey) {
        for (const ms of FOLLOW_UP_MS) setTimeout(() => void mutate(swrKey), ms)
      }
    },
    [mutate, swrKey],
  )

  return { refreshInterval, sendCommand }
}
