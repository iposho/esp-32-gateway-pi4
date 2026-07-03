export function timeAgo(iso: string | null): string {
  if (!iso) return 'нет данных'
  const diff = Date.now() - new Date(iso).getTime()
  const sec = Math.floor(diff / 1000)
  if (sec < 5) return 'только что'
  if (sec < 60) return `${sec} с назад`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min} мин назад`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} ч назад`
  const days = Math.floor(hr / 24)
  return `${days} дн назад`
}

/* ── Human-readable telemetry key labels ── */

const KEY_LABELS: Record<string, string> = {
  uptime: 'Время работы',
  uptime_s: 'Время работы',
  uptime_sec: 'Время работы',
  rssi: 'Сигнал Wi-Fi',
  wifi_rssi: 'Сигнал Wi-Fi',
  heap: 'Свободная RAM',
  free_heap: 'Свободная RAM',
  memory_free: 'Свободная память',
  temp: 'Температура',
  temperature: 'Температура',
  temperature_c: 'Температура',
  humidity: 'Влажность',
  humidity_pct: 'Влажность',
  pressure: 'Давление',
  pressure_hpa: 'Давление',
  voltage: 'Напряжение',
  vcc: 'Питание',
  battery_voltage: 'Напряжение батареи',
  battery: 'Батарея',
  battery_pct: 'Заряд батареи',
  battery_percent: 'Заряд батареи',
  lux: 'Освещённость',
  light: 'Освещённость',
  wifi_ssid: 'Wi-Fi сеть',
  ip: 'IP-адрес',
  camera_ready: 'Камера',
  capture_count: 'Снимков',
  fw_version: 'Прошивка',
  sdk_version: 'SDK',
  mac: 'MAC-адрес',
  interval: 'Интервал',
  interval_s: 'Интервал отправки',
  relay: 'Реле',
  led: 'LED',
  button: 'Кнопка',
  motion: 'Движение',
  co2: 'CO2',
  pm25: 'PM2.5',
  pm10: 'PM10',
  soil: 'Влажность почвы',
  soil_moisture: 'Влажность почвы',
}

const ACRONYMS = new Set(['ip', 'mac', 'rssi', 'ssid', 'sdk', 'ota', 'co2', 'pm25', 'pm10'])

/**
 * Returns a human-readable label for a telemetry key.
 * Falls back to the raw key if no label is defined.
 */
export function labelForKey(key: string): string {
  const normalized = key.toLowerCase()
  if (KEY_LABELS[normalized]) return KEY_LABELS[normalized]

  return normalized
    .replace(/_pct$/, '_percent')
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => {
      if (ACRONYMS.has(part)) return part.toUpperCase()
      return part.charAt(0).toUpperCase() + part.slice(1)
    })
    .join(' ')
}

/* ── Value formatting with units ── */

/** Format uptime seconds into a compact human string */
function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds} с`
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return s > 0 ? `${m} мин ${s} с` : `${m} мин`
  }
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h < 24) {
    return m > 0 ? `${h} ч ${m} мин` : `${h} ч`
  }
  const d = Math.floor(h / 24)
  const rh = h % 24
  return rh > 0 ? `${d} дн ${rh} ч` : `${d} дн`
}

/** Format bytes into a human-readable size */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} КБ`
  const mb = kb / 1024
  return `${mb.toFixed(1)} МБ`
}

/**
 * Format a telemetry value with a unit based on the key name.
 * Returns a tuple [formattedValue, unit] for flexible rendering,
 * but toString gives "value unit".
 */
export function formatValue(value: unknown, key?: string): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'boolean') return value ? 'Да' : 'Нет'
  if (typeof value === 'object') return JSON.stringify(value)

  if (typeof value === 'number' && key) {
    const k = key.toLowerCase()

    // Uptime in seconds → human duration
    if (k === 'uptime' || k === 'uptime_s' || k === 'uptime_sec') {
      return formatUptime(Math.floor(value))
    }

    if (k.endsWith('_ms') || k.includes('millis')) {
      return `${Number(value).toLocaleString('ru-RU')} мс`
    }

    // Memory / heap in bytes → KB/MB
    if (k === 'heap' || k === 'free_heap' || k.includes('heap') || k.includes('memory')) {
      return formatBytes(value)
    }

    // RSSI in dBm
    if (k === 'rssi' || k.includes('rssi')) {
      return `${Math.round(value)} dBm`
    }

    // Temperature
    if (k === 'temp' || k === 'temperature' || k.includes('temp')) {
      return `${Number(value).toFixed(1)} °C`
    }

    // Humidity
    if (k === 'humidity' || k.includes('humid')) {
      return `${Number(value).toFixed(1)} %`
    }

    // Pressure
    if (k === 'pressure' || k === 'pressure_hpa' || k.includes('press')) {
      return `${Number(value).toFixed(0)} гПа`
    }

    // Voltage
    if (k === 'voltage' || k === 'vcc' || k.includes('volt')) {
      return `${Number(value).toFixed(2)} В`
    }

    // Battery percentage
    if (k === 'battery' || k === 'bat' || k.includes('battery') || k.endsWith('_pct') || k.endsWith('_percent')) {
      return `${Number(value).toFixed(0)} %`
    }

    // Light / lux
    if (k === 'lux' || k.includes('light') || k.includes('lux')) {
      return `${Number(value).toFixed(0)} лк`
    }

    if (k === 'co2') {
      return `${Number(value).toFixed(0)} ppm`
    }

    if (k === 'pm25' || k === 'pm2_5' || k === 'pm10') {
      return `${Number(value).toFixed(0)} мкг/м³`
    }

    if (k.includes('soil')) {
      return `${Number(value).toFixed(0)} %`
    }

    // Interval in seconds
    if (k === 'interval' || k === 'interval_s') {
      return `${Number(value).toLocaleString('ru-RU')} с`
    }

    // Capture count — just a number
    if (k === 'capture_count') {
      return String(value)
    }

    // Generic number — keep as is
    return Number.isInteger(value) ? value.toLocaleString('ru-RU') : value.toLocaleString('ru-RU', { maximumFractionDigits: 2 })
  }

  return String(value)
}
