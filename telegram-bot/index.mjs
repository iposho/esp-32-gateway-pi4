import mqtt from 'mqtt'

const {
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_ALLOWED_CHAT_IDS = '',
  TELEGRAM_DEVICE_MAP = '',
  TELEGRAM_DEFAULT_DEVICE = '',
  TELEGRAM_POLL_TIMEOUT = '30',
  TELEGRAM_OFFLINE_TIMEOUT = '120',
  TELEGRAM_API_BASE = 'https://api.telegram.org',
  MQTT_URL = 'mqtt://mosquitto:1883',
  MQTT_USERNAME = '',
  MQTT_PASSWORD = '',
} = process.env

if (!TELEGRAM_BOT_TOKEN) {
  throw new Error('TELEGRAM_BOT_TOKEN is required')
}

const allowedChatIds = new Set(
  TELEGRAM_ALLOWED_CHAT_IDS
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean),
)

const devices = parseDeviceMap(TELEGRAM_DEVICE_MAP)
if (devices.size === 0) {
  throw new Error('TELEGRAM_DEVICE_MAP is required, for example balcony:esp32-balcony,flat:esp32-flat')
}

const aliasesByDeviceId = new Map([...devices.entries()].map(([alias, deviceId]) => [deviceId, alias]))
const defaultAlias = TELEGRAM_DEFAULT_DEVICE && devices.has(TELEGRAM_DEFAULT_DEVICE)
  ? TELEGRAM_DEFAULT_DEVICE
  : [...devices.keys()][0]

const state = new Map(
  [...devices.entries()].map(([alias, deviceId]) => [
    alias,
    {
      alias,
      deviceId,
      status: 'unknown',
      telemetry: {},
      statusSeen: false,
      ota: undefined,
      lastError: undefined,
      unresponsive: false,
      updatedAt: null,
    },
  ]),
)

let telegramOffset = 0

const mqttClient = mqtt.connect(MQTT_URL, {
  username: MQTT_USERNAME || undefined,
  password: MQTT_PASSWORD || undefined,
  clientId: `telegram-bot-${Math.random().toString(16).slice(2)}`,
  clean: true,
  reconnectPeriod: 3000,
})

mqttClient.on('connect', () => {
  console.log(`[mqtt] connected to ${MQTT_URL}`)
  mqttClient.subscribe(['devices/+/status', 'devices/+/telemetry'], { qos: 1 }, (error) => {
    if (error) console.error('[mqtt] subscribe failed', error)
  })
})

mqttClient.on('error', (error) => {
  console.error('[mqtt] error', error.message)
})

mqttClient.on('message', (topic, payloadBuffer) => {
  const [, deviceId, kind] = topic.split('/')
  const alias = aliasesByDeviceId.get(deviceId)
  if (!alias) return

  const device = state.get(alias)
  if (!device) return

  const payload = parsePayload(payloadBuffer)
  const wasUnresponsive = device.unresponsive
  device.unresponsive = false
  device.updatedAt = new Date()

  if (kind === 'status') {
    const nextStatus = normalizeStatus(payload)
    const previousStatus = device.status
    device.status = nextStatus

    if (device.statusSeen && previousStatus !== nextStatus) {
      const detail = payload && typeof payload === 'object' && typeof payload.error === 'string' && payload.error
        ? `\n<code>${escapeHtml(payload.error)}</code>`
        : ''
      void notifyAll(`${statusEmoji(nextStatus)} <b>${escapeHtml(alias)}</b>\nСтатус: <b>${escapeHtml(nextStatus)}</b>${detail}`)
    } else if (wasUnresponsive && nextStatus === 'online') {
      void notifyAll(`🟢 <b>${escapeHtml(alias)}</b>\nСнова на связи`)
    }
    device.statusSeen = true
    return
  }

  if (kind === 'telemetry') {
    const telemetry = typeof payload === 'object' && payload !== null ? payload : { value: payload }
    device.telemetry = telemetry

    if (wasUnresponsive) {
      void notifyAll(`🟢 <b>${escapeHtml(alias)}</b>\nСнова на связи`)
    }

    const errorText = typeof telemetry.error === 'string' && telemetry.error.trim() ? telemetry.error.trim() : null
    if (errorText && errorText !== device.lastError) {
      device.lastError = errorText
      void notifyAll(`🚨 <b>${escapeHtml(alias)}</b>\nОшибка: <code>${escapeHtml(errorText)}</code>`)
    } else if (!errorText) {
      device.lastError = undefined
    }

    if (typeof telemetry.ota === 'string' && telemetry.ota !== device.ota) {
      device.ota = telemetry.ota
      if (telemetry.ota === 'failed' || telemetry.ota === 'success') {
        void notifyAll(formatOtaNotification(alias, telemetry))
      }
    }
  }
})

const offlineTimeoutMs = Math.max(0, Number(TELEGRAM_OFFLINE_TIMEOUT) || 0) * 1000
if (offlineTimeoutMs > 0) {
  setInterval(checkUnresponsiveDevices, Math.max(1000, Math.min(offlineTimeoutMs / 4, 15_000)))
}

function checkUnresponsiveDevices() {
  const now = Date.now()
  for (const device of state.values()) {
    if (device.unresponsive || device.status !== 'online' || !device.updatedAt) continue
    if (now - device.updatedAt.getTime() < offlineTimeoutMs) continue

    device.unresponsive = true
    const silentFor = Math.round((now - device.updatedAt.getTime()) / 1000)
    void notifyAll(
      `⚠️ <b>${escapeHtml(device.alias)}</b>\nНе выходит на связь ${formatUptime(silentFor)} — возможно, офлайн`,
    )
  }
}

function statusEmoji(status) {
  if (status === 'online') return '🟢'
  if (status === 'offline') return '🔴'
  if (status === 'error') return '🚨'
  return '🔔'
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

void pollTelegram()

function parseDeviceMap(raw) {
  const map = new Map()
  for (const item of raw.split(',')) {
    const [alias, deviceId] = item.split(':').map((part) => part?.trim()).filter(Boolean)
    if (alias && deviceId) map.set(alias, deviceId)
  }
  return map
}

function parsePayload(buffer) {
  const raw = buffer.toString()
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

function normalizeStatus(payload) {
  if (typeof payload === 'string') return payload
  if (payload && typeof payload === 'object' && typeof payload.status === 'string') return payload.status
  return 'unknown'
}

async function pollTelegram() {
  console.log('[telegram] polling started')
  while (true) {
    try {
      const updates = await telegram('getUpdates', {
        offset: telegramOffset,
        timeout: Number(TELEGRAM_POLL_TIMEOUT),
        allowed_updates: ['message', 'callback_query'],
      })

      for (const update of updates.result ?? []) {
        telegramOffset = update.update_id + 1
        await handleUpdate(update)
      }
    } catch (error) {
      console.error('[telegram] polling error', error.message)
      await sleep(3000)
    }
  }
}

async function handleUpdate(update) {
  if (update.message) {
    const chatId = String(update.message.chat.id)
    if (!isAllowed(chatId)) return

    const text = update.message.text?.trim() ?? ''
    if (!text) return

    await handleCommand(chatId, text)
    return
  }

  if (update.callback_query) {
    const chatId = String(update.callback_query.message?.chat.id)
    if (!isAllowed(chatId)) return

    await telegram('answerCallbackQuery', { callback_query_id: update.callback_query.id })
    await handleCallback(chatId, update.callback_query.data ?? '')
  }
}

async function handleCommand(chatId, text) {
  const [commandWithBot, ...args] = text.split(/\s+/)
  const command = commandWithBot.split('@')[0].toLowerCase()

  if (command === '/start' || command === '/help') {
    await sendMessage(chatId, helpText(), mainKeyboard())
    return
  }

  if (command === '/devices') {
    await sendMessage(chatId, 'Выберите устройство:', devicesKeyboard())
    return
  }

  if (command === '/status') {
    await sendDeviceStatus(chatId, resolveAlias(args[0]))
    return
  }

  if (command === '/led') {
    await handleLed(chatId, args)
    return
  }

  if (command === '/capture') {
    await publishCommand(chatId, resolveAlias(args[0]), { action: 'capture' })
    return
  }

  if (command === '/reboot') {
    const alias = resolveAlias(args[0])
    await sendMessage(chatId, `Подтвердить перезагрузку <b>${escapeHtml(alias)}</b>?`, {
      inline_keyboard: [[
        { text: 'Перезагрузить', callback_data: `confirm:reboot:${alias}` },
        { text: 'Отмена', callback_data: `device:${alias}` },
      ]],
    })
    return
  }

  if (command === '/pin_read') {
    const [aliasArg, pinArg] = normalizeDeviceArg(args)
    await publishCommand(chatId, aliasArg, { action: 'pin_read', pin: Number(pinArg) })
    return
  }

  if (command === '/pin_write') {
    const [aliasArg, pinArg, valueArg] = normalizeDeviceArg(args)
    await publishCommand(chatId, aliasArg, {
      action: 'pin_write',
      pin: Number(pinArg),
      value: Number(valueArg),
    })
    return
  }

  await sendMessage(chatId, 'Неизвестная команда.\n\n' + helpText(), mainKeyboard())
}

async function handleLed(chatId, args) {
  const [aliasArg, valueArg] = normalizeDeviceArg(args)
  const value = parseBoolean(valueArg)
  if (value === null) {
    await sendMessage(chatId, 'Формат: <code>/led balcony on</code> или <code>/led balcony off</code>')
    return
  }
  await publishCommand(chatId, aliasArg, { action: 'led', value })
}

async function handleCallback(chatId, data) {
  const [kind, action, alias, arg] = data.split(':')

  if (kind === 'devices') {
    await sendMessage(chatId, 'Выберите устройство:', devicesKeyboard())
    return
  }

  if (kind === 'device') {
    await sendDeviceStatus(chatId, action)
    return
  }

  if (kind === 'cmd') {
    if (action === 'led_on') await publishCommand(chatId, alias, { action: 'led', value: true })
    if (action === 'led_off') await publishCommand(chatId, alias, { action: 'led', value: false })
    if (action === 'capture') await publishCommand(chatId, alias, { action: 'capture' })
    if (action === 'status') await sendDeviceStatus(chatId, alias)
    return
  }

  if (kind === 'confirm' && action === 'reboot') {
    await publishCommand(chatId, alias, { action: 'reboot' })
    return
  }

  if (kind === 'confirm' && action === 'cancel') {
    await sendDeviceStatus(chatId, alias || defaultAlias)
  }
}

function normalizeDeviceArg(args) {
  if (args.length === 0) return [defaultAlias]
  if (devices.has(args[0])) return args
  return [defaultAlias, ...args]
}

function resolveAlias(alias) {
  if (!alias) return defaultAlias
  if (devices.has(alias)) return alias
  return defaultAlias
}

async function sendDeviceStatus(chatId, alias) {
  const device = state.get(resolveAlias(alias))
  if (!device) {
    await sendMessage(chatId, 'Устройство не найдено.', devicesKeyboard())
    return
  }

  await sendMessage(chatId, formatDeviceStatus(device), deviceKeyboard(device.alias))
}

async function publishCommand(chatId, alias, payload) {
  const device = state.get(resolveAlias(alias))
  if (!device) {
    await sendMessage(chatId, 'Устройство не найдено.', devicesKeyboard())
    return
  }

  if (!validatePayload(payload)) {
    await sendMessage(chatId, 'Команда заполнена некорректно.')
    return
  }

  const topic = `devices/${device.deviceId}/command`
  mqttClient.publish(topic, JSON.stringify(payload), { qos: 1 }, async (error) => {
    if (error) {
      await sendMessage(chatId, `Не удалось отправить команду: ${escapeHtml(error.message)}`)
      return
    }

    await sendMessage(
      chatId,
      `Команда отправлена в <b>${escapeHtml(device.alias)}</b>\n<code>${escapeHtml(JSON.stringify(payload))}</code>`,
      deviceKeyboard(device.alias),
    )
  })
}

function validatePayload(payload) {
  if (!payload || typeof payload.action !== 'string') return false
  if ('pin' in payload && !Number.isFinite(payload.pin)) return false
  if ('value' in payload && !Number.isFinite(payload.value) && typeof payload.value !== 'boolean') return false
  return true
}

function formatDeviceStatus(device) {
  const telemetry = device.telemetry ?? {}
  const lines = [
    `<b>${escapeHtml(device.alias)}</b>`,
    `<code>${escapeHtml(device.deviceId)}</code>`,
    '',
    `Статус: ${statusEmoji(device.status)} <b>${escapeHtml(device.status)}</b>`,
  ]

  if (device.unresponsive) {
    lines.push('⚠️ Не выходит на связь — возможно, офлайн')
  }

  if (device.lastError) {
    lines.push(`🚨 Ошибка: <code>${escapeHtml(device.lastError)}</code>`)
  }

  if (device.updatedAt) {
    lines.push(`Обновлено: ${escapeHtml(device.updatedAt.toLocaleString('ru-RU'))}`)
  }

  const keys = ['uptime', 'rssi', 'heap', 'free_heap', 'temperature', 'temp', 'humidity', 'ota', 'progress']
  for (const key of keys) {
    if (telemetry[key] !== undefined) {
      lines.push(`${escapeHtml(labelForKey(key))}: <code>${escapeHtml(formatValue(telemetry[key], key))}</code>`)
    }
  }

  return lines.join('\n')
}

function formatOtaNotification(alias, telemetry) {
  const progress = typeof telemetry.progress === 'number' ? ` (${Math.round(telemetry.progress)}%)` : ''
  return `📦 <b>${escapeHtml(alias)}</b>\nOTA: <b>${escapeHtml(telemetry.ota)}${progress}</b>`
}

function helpText() {
  return [
    '<b>ESP32 Gateway Bot</b>',
    '',
    '<code>/devices</code> — список устройств',
    '<code>/status [device]</code> — статус',
    '<code>/led [device] on|off</code> — LED',
    '<code>/capture [device]</code> — снимок с камеры',
    '<code>/reboot [device]</code> — перезагрузка с подтверждением',
    '<code>/pin_read [device] &lt;pin&gt;</code> — чтение GPIO',
    '<code>/pin_write [device] &lt;pin&gt; &lt;value&gt;</code> — запись GPIO',
    '',
    `Устройство по умолчанию: <b>${escapeHtml(defaultAlias)}</b>`,
  ].join('\n')
}

function mainKeyboard() {
  return {
    inline_keyboard: [
      [{ text: 'Устройства', callback_data: 'devices' }],
    ],
  }
}

function devicesKeyboard() {
  return {
    inline_keyboard: [...devices.keys()].map((alias) => [
      { text: alias, callback_data: `device:${alias}` },
    ]),
  }
}

function deviceKeyboard(alias) {
  return {
    inline_keyboard: [
      [
        { text: 'Статус', callback_data: `cmd:status:${alias}` },
        { text: 'Снимок', callback_data: `cmd:capture:${alias}` },
      ],
      [
        { text: 'LED вкл', callback_data: `cmd:led_on:${alias}` },
        { text: 'LED выкл', callback_data: `cmd:led_off:${alias}` },
      ],
      [
        { text: 'Все устройства', callback_data: 'devices' },
      ],
    ],
  }
}

function isAllowed(chatId) {
  if (allowedChatIds.size === 0) {
    console.warn(`[telegram] rejected chat ${chatId}: TELEGRAM_ALLOWED_CHAT_IDS is empty`)
    return false
  }
  return allowedChatIds.has(chatId)
}

async function notifyAll(text) {
  for (const chatId of allowedChatIds) {
    await sendMessage(chatId, text)
    await sleep(100)
  }
}

async function sendMessage(chatId, text, replyMarkup) {
  return telegram('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  })
}

async function telegram(method, payload) {
  const response = await fetch(`${TELEGRAM_API_BASE}/bot${TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const data = await response.json()
  if (!response.ok || data.ok === false) {
    throw new Error(data.description ?? `Telegram ${method} failed`)
  }

  return data
}

function parseBoolean(value) {
  if (value === 'on' || value === '1' || value === 'true') return true
  if (value === 'off' || value === '0' || value === 'false') return false
  return null
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function labelForKey(key) {
  const labels = {
    uptime: 'Время работы',
    rssi: 'Сигнал Wi-Fi',
    heap: 'Свободная RAM',
    free_heap: 'Свободная RAM',
    temperature: 'Температура',
    temp: 'Температура',
    humidity: 'Влажность',
    ota: 'OTA',
    progress: 'Прогресс',
  }
  return labels[key] ?? key
}

function formatValue(value, key) {
  if (value === null || value === undefined) return '—'
  if (typeof value !== 'number') return String(value)
  if (key === 'uptime') return formatUptime(Math.floor(value))
  if (key === 'heap' || key === 'free_heap') return formatBytes(value)
  if (key === 'rssi') return `${Math.round(value)} dBm`
  if (key === 'temperature' || key === 'temp') return `${value.toFixed(1)} °C`
  if (key === 'humidity' || key === 'progress') return `${Math.round(value)} %`
  return Number.isInteger(value) ? value.toLocaleString('ru-RU') : value.toLocaleString('ru-RU', { maximumFractionDigits: 2 })
}

function formatUptime(seconds) {
  if (seconds < 60) return `${seconds} с`
  if (seconds < 3600) return `${Math.floor(seconds / 60)} мин`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} ч ${Math.floor((seconds % 3600) / 60)} мин`
  return `${Math.floor(seconds / 86400)} дн ${Math.floor((seconds % 86400) / 3600)} ч`
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} Б`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} КБ`
  return `${(kb / 1024).toFixed(1)} МБ`
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function shutdown() {
  console.log('[telegram] shutting down')
  mqttClient.end(true, () => process.exit(0))
}
