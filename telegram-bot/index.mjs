import mqtt from 'mqtt'

// ═══════════════════════════════════════════
//  Config
// ═══════════════════════════════════════════

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

// ── State ────────────────────────────────────

const state = new Map(
  [...devices.entries()].map(([alias, deviceId]) => [
    alias,
    {
      alias,
      deviceId,
      status: 'unknown',
      telemetry: {},
      statusSeen: false,
      capabilities: null,
      ota: undefined,
      lastError: undefined,
      unresponsive: false,
      updatedAt: null,
    },
  ]),
)

let telegramOffset = 0

/** Ожидающие свежей телеметрии после команды: deviceId → [resolve] */
const telemetryWaiters = new Map()

// ═══════════════════════════════════════════
//  MQTT
// ═══════════════════════════════════════════

const mqttClient = mqtt.connect(MQTT_URL, {
  username: MQTT_USERNAME || undefined,
  password: MQTT_PASSWORD || undefined,
  clientId: `telegram-bot-${Math.random().toString(16).slice(2)}`,
  clean: true,
  reconnectPeriod: 3000,
})

mqttClient.on('connect', () => {
  console.log(`[mqtt] connected to ${MQTT_URL}`)
  mqttClient.subscribe(['devices/+/status', 'devices/+/telemetry', 'devices/+/capabilities'], { qos: 1 }, (error) => {
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

  // Retained-описание команд/метрик из скетча — не считаем «признаком жизни»
  if (kind === 'capabilities') {
    device.capabilities = normalizeCapabilities(payload)
    return
  }
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
      void notifyAll(
        `${statusEmoji(nextStatus)} <b>${escapeHtml(alias)}</b> — статус изменился\n` +
        `${statusEmoji(previousStatus)} ${escapeHtml(previousStatus)} ` +
        `${statusEmoji(nextStatus)} ${escapeHtml(nextStatus)}${detail}`
      )
    } else if (wasUnresponsive && nextStatus === 'online') {
          const silenceDuration = device._unresponsiveSince
            ? formatUptime(Math.round((Date.now() - device._unresponsiveSince) / 1000))
            : null
          delete device._unresponsiveSince
          void notifyAll(
            `🟢 <b>${escapeHtml(alias)}</b>\nСнова на связи` +
            (silenceDuration ? ` после ${silenceDuration} молчания` : '')
          )
    }
    device.statusSeen = true
    return
  }

  if (kind === 'telemetry') {
    const telemetry = typeof payload === 'object' && payload !== null ? payload : { value: payload }
    device.telemetry = telemetry
    resolveTelemetryWaiters(device.deviceId)

    if (wasUnresponsive) {
      void notifyAll(
        `🟢 <b>${escapeHtml(alias)}</b>\nСнова на связи — получена телеметрия`
      )
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

// ── Offline detection ────────────────────────

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
    device._unresponsiveSince = now
    const silentFor = Math.round((now - device.updatedAt.getTime()) / 1000)
    void notifyAll(
      `⚠️ <b>${escapeHtml(device.alias)}</b>\nНе выходит на связь ${formatUptime(silentFor)} — возможно, офлайн`,
    )
  }
}

// ═══════════════════════════════════════════
//  Telegram polling
// ═══════════════════════════════════════════

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

void pollTelegram()

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

    await handleCallback(update.callback_query)
  }
}

// ═══════════════════════════════════════════
//  Command handlers
// ═══════════════════════════════════════════

async function handleCommand(chatId, text) {
  const [commandWithBot, ...args] = text.split(/\s+/)
  const command = commandWithBot.split('@')[0].toLowerCase()

  if (command === '/start' || command === '/help') {
    await sendMessage(chatId, helpText(), mainKeyboard())
    return
  }

  if (command === '/devices') {
    await sendMessage(chatId, devicesText(), devicesKeyboard())
    return
  }

  if (command === '/status') {
    await sendDeviceStatus(chatId, resolveAlias(args[0]))
    return
  }

  if (command === '/dashboard' || command === '/all') {
    await sendMessage(chatId, dashboardText(), devicesKeyboard())
    return
  }

  if (command === '/commands') {
    await sendDeviceStatus(chatId, resolveAlias(args[0]))
    return
  }

  if (command === '/led') {
    await handleLed(chatId, args)
    return
  }

  if (command === '/capture') {
    await handleCapture(chatId, args)
    return
  }

  if (command === '/reboot') {
    const alias = resolveAlias(args[0])
    await sendMessage(chatId, `⚠️ Подтвердить перезагрузку <b>${escapeHtml(alias)}</b>?`, {
      inline_keyboard: [[
        { text: '🔄 Перезагрузить', callback_data: `confirm:reboot:${alias}` },
        { text: '✖️ Отмена', callback_data: `dev:${alias}` },
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

  await sendMessage(chatId, '❓ Неизвестная команда.\n\n' + helpText(), mainKeyboard())
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

async function handleCapture(chatId, args) {
  const alias = resolveAlias(args[0])
  const device = state.get(alias)
  if (!device) {
    await sendMessage(chatId, 'Устройство не найдено.', devicesKeyboard())
    return
  }

  // Check if we already have a camera URL from previous telemetry
  const captureUrl = device.telemetry?.capture_url
  if (captureUrl) {
    // Send the command first, then try to send the photo
    mqttClient.publish(
      `devices/${device.deviceId}/command`,
      JSON.stringify({ action: 'capture' }),
      { qos: 1 },
    )
    try {
      await sendPhoto(chatId, captureUrl)
    } catch {
      await sendMessage(
        chatId,
        `📸 Команда отправлена в <b>${escapeHtml(alias)}</b>\nНе удалось получить снимок по ранее известному URL.`,
        deviceKeyboard(device),
      )
    }
    return
  }

  // No known URL — just send the command
  await publishCommand(chatId, alias, { action: 'capture' })
}

async function handleCallback(query) {
  const chatId = String(query.message?.chat.id)
  const messageId = query.message?.message_id
  const data = query.data ?? ''
  const [kind, alias, idxRaw, valueRaw] = data.split(':')
  const answer = (text) =>
    telegram('answerCallbackQuery', {
      callback_query_id: query.id,
      ...(text ? { text } : {}),
    }).catch(() => {})

  // Навигация — перерисовываем то же сообщение, а не шлём новое
  if (kind === 'devices' || kind === 'devs') {
    await answer()
    await render(chatId, messageId, devicesText(), devicesKeyboard())
    return
  }
  if (kind === 'dash' || (kind === 'checkin' && alias !== 'help')) {
    await answer()
    await render(chatId, messageId, dashboardText(), devicesKeyboard())
    return
  }
  if (kind === 'help' || kind === 'checkin') {
    await answer()
    await sendMessage(chatId, helpText(), mainKeyboard())
    return
  }
  if (kind === 'noop') {
    await answer()
    return
  }

  // Старые кнопки (device:<alias>, cmd:status:<alias>) тоже открывают карточку
  const targetAlias =
    kind === 'device' ? alias : kind === 'cmd' || kind === 'confirm' ? idxRaw : alias
  const device = state.get(targetAlias)
  if (!device) {
    await answer('Устройство не найдено')
    return
  }

  if (kind === 'dev' || kind === 'device' || kind === 'ref' || (kind === 'cmd' && alias === 'status')) {
    await answer(kind === 'ref' ? 'Обновлено' : undefined)
    await showDevice(chatId, device.alias, messageId)
    return
  }

  if (kind === 'cap' || (kind === 'cmd' && alias === 'capture')) {
    await answer('📸 Делаю снимок…')
    await handleCapture(chatId, [device.alias])
    return
  }

  if (kind === 'confirm' && alias === 'reboot') {
    await answer()
    await runCommand(chatId, messageId, device, { action: 'reboot' }, 'Перезагрузка')
    return
  }

  const cmd = deviceCommands(device)[Number(idxRaw)]
  if (!cmd) {
    await answer('Команда устарела — обновляю карточку')
    await showDevice(chatId, device.alias, messageId)
    return
  }

  // Опасные команды — через подтверждение в той же карточке
  if (kind === 'ask') {
    await answer()
    await render(
      chatId,
      messageId,
      `${commandEmoji(cmd)} <b>${escapeHtml(cmd.title)}</b> на <b>${escapeHtml(device.alias)}</b>?\n\n` +
        (cmd.description ? `<i>${escapeHtml(cmd.description)}</i>\n\n` : '') +
        'Подтвердите действие.',
      {
        inline_keyboard: [[
          { text: `✅ ${cmd.title}`, callback_data: `c:${device.alias}:${idxRaw}:y` },
          { text: '✖️ Отмена', callback_data: `dev:${device.alias}` },
        ]],
      },
    )
    return
  }

  if (kind === 'c') {
    if (isDangerous(cmd) && valueRaw !== 'y') {
      await answer()
      return
    }
    let payload = { action: cmd.action }
    let label = cmd.title
    if (cmd.type === 'toggle') {
      const next = !toggleValue(device, cmd)
      payload = { action: cmd.action, value: next }
      label = `${cmd.title}: ${next ? 'вкл' : 'выкл'}`
    }
    await answer(`⏳ ${label}`)
    await runCommand(chatId, messageId, device, payload, label)
    return
  }

  if (kind === 'r') {
    const value = Number(valueRaw)
    if (!Number.isFinite(value)) {
      await answer()
      return
    }
    const clamped = clampRange(cmd, value)
    await answer(`⏳ ${cmd.title}: ${clamped}`)
    await runCommand(chatId, messageId, device, { action: cmd.action, value: clamped }, `${cmd.title}: ${clamped}`)
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

// ═══════════════════════════════════════════
//  Core bot actions
// ═══════════════════════════════════════════

async function sendDeviceStatus(chatId, alias) {
  await showDevice(chatId, resolveAlias(alias))
}

/** Карточка устройства: новое сообщение или правка существующего */
async function showDevice(chatId, alias, messageId, note) {
  const device = state.get(resolveAlias(alias))
  if (!device) {
    await sendMessage(chatId, '❌ Устройство не найдено.', devicesKeyboard())
    return
  }
  const text = formatDeviceStatus(device) + (note ? `\n\n${note}` : '')
  await render(chatId, messageId, text, deviceKeyboard(device))
}

/**
 * Отправить команду из кнопки и обновить карточку, когда устройство
 * ответит телеметрией (прошивки публикуют её сразу после команды).
 */
async function runCommand(chatId, messageId, device, payload, label) {
  if (!validatePayload(payload)) {
    await sendMessage(chatId, '❌ Команда заполнена некорректно.')
    return
  }

  const waiter = waitForTelemetry(device.deviceId, 4000)
  try {
    await mqttPublish(`devices/${device.deviceId}/command`, payload)
  } catch (error) {
    waiter.cancel()
    await showDevice(chatId, device.alias, messageId, `❌ Не удалось отправить: ${escapeHtml(error.message)}`)
    return
  }

  if (payload.action === 'reboot') {
    waiter.cancel()
    await showDevice(chatId, device.alias, messageId, `🔄 <i>${escapeHtml(label)} — команда отправлена</i>`)
    return
  }

  const answered = await waiter.promise
  const note = answered
    ? `✅ <i>${escapeHtml(label)}</i>`
    : `📨 <i>${escapeHtml(label)} — отправлено, ответа пока нет</i>`
  await showDevice(chatId, device.alias, messageId, note)
}

function waitForTelemetry(deviceId, timeoutMs) {
  let entry
  const promise = new Promise((resolve) => {
    const timer = setTimeout(() => finish(false), timeoutMs)
    const finish = (ok) => {
      clearTimeout(timer)
      const list = telemetryWaiters.get(deviceId) ?? []
      telemetryWaiters.set(deviceId, list.filter((w) => w !== entry))
      resolve(ok)
    }
    entry = finish
    telemetryWaiters.set(deviceId, [...(telemetryWaiters.get(deviceId) ?? []), entry])
  })
  return { promise, cancel: () => entry(false) }
}

function resolveTelemetryWaiters(deviceId) {
  for (const finish of telemetryWaiters.get(deviceId) ?? []) finish(true)
}

function mqttPublish(topic, payload) {
  return new Promise((resolve, reject) => {
    if (!mqttClient.connected) {
      reject(new Error('нет связи с MQTT-брокером'))
      return
    }
    mqttClient.publish(topic, JSON.stringify(payload), { qos: 1 }, (error) =>
      error ? reject(error) : resolve(),
    )
  })
}

async function publishCommand(chatId, alias, payload) {
  const device = state.get(resolveAlias(alias))
  if (!device) {
    await sendMessage(chatId, '❌ Устройство не найдено.', devicesKeyboard())
    return
  }
  await runCommand(chatId, undefined, device, payload, JSON.stringify(payload))
}

// ═══════════════════════════════════════════
//  Message formatters
// ═══════════════════════════════════════════

function formatDeviceStatus(device) {
  const telemetry = device.telemetry ?? {}
  const lines = [
    `${deviceEmoji(device)} <b>${escapeHtml(device.alias)}</b>  ·  ${statusLabel(device)}`,
    `<code>${escapeHtml(device.deviceId)}</code>` +
      (device.updatedAt ? `  ·  ${timeAgo(device.updatedAt)}` : ''),
  ]

  if (device.unresponsive) {
    lines.push('', '⚠️ <b>Не выходит на связь — возможно, офлайн</b>')
  }
  if (device.lastError) {
    lines.push('', `🚨 <b>Ошибка</b>\n<code>${escapeHtml(device.lastError)}</code>`)
  }

  const groups = buildMetricGroups(device)
  if (groups.length === 0 && Object.keys(telemetry).length === 0) {
    lines.push('', '<i>Телеметрии пока нет</i>')
  }

  for (const group of groups) {
    lines.push('', `<b>${groupEmoji(group.name)} ${escapeHtml(group.name)}</b>`)
    const rows = group.items.map(({ def, value }) => {
      const bar = metricBar(def, value)
      return `${metricEmoji(def)} ${escapeHtml(def.label)}: <b>${escapeHtml(formatMetric(def, value))}</b>${bar ? '  ' + bar : ''}`
    })
    lines.push(`<blockquote>${rows.join('\n')}</blockquote>`)
  }

  return lines.join('\n')
}

/**
 * Группы метрик: по схеме из capabilities.metrics (как в админке),
 * а без неё — по известным ключам телеметрии.
 */
function buildMetricGroups(device) {
  const telemetry = device.telemetry ?? {}
  const defs = device.capabilities?.metrics?.length
    ? device.capabilities.metrics
    : FALLBACK_METRICS

  const byGroup = new Map()
  const sorted = [...defs]
    .filter((d) => d && typeof d.key === 'string' && !d.hidden)
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))

  for (const def of sorted) {
    const value = metricValue(telemetry, def)
    if (value === undefined || value === null || value === '') continue
    const name = def.group || 'Прочее'
    if (!byGroup.has(name)) byGroup.set(name, [])
    byGroup.get(name).push({ def: { ...def, label: def.label || def.key }, value })
  }

  return [...byGroup.entries()].map(([name, items]) => ({ name, items }))
}

function metricValue(telemetry, def) {
  for (const key of [def.key, ...(def.keys ?? [])]) {
    if (telemetry[key] !== undefined) return telemetry[key]
  }
  return undefined
}

const FALLBACK_METRICS = [
  { key: 'ip', keys: ['ip_address'], label: 'IP-адрес', icon: 'globe', group: 'Сеть', order: 0 },
  { key: 'rssi', keys: ['wifi_rssi'], label: 'Сигнал Wi-Fi', icon: 'signal', format: 'rssi', group: 'Сеть', order: 1 },
  { key: 'uptime', label: 'Аптайм', icon: 'clock', format: 'uptime', group: 'Система', order: 2 },
  { key: 'free_heap', keys: ['heap'], label: 'Свободная RAM', icon: 'memory', format: 'bytes', group: 'Система', order: 3 },
  { key: 'fw_version', label: 'Прошивка', icon: 'cpu', group: 'Система', order: 4 },
  { key: 'temperature', keys: ['temp'], label: 'Температура', icon: 'thermometer', format: 'temperature', group: 'Окружение', order: 5 },
  { key: 'humidity', label: 'Влажность', icon: 'droplets', format: 'percent', group: 'Окружение', order: 6 },
  { key: 'ota', label: 'Статус', group: 'OTA', order: 7 },
  { key: 'progress', label: 'Прогресс', format: 'percent', group: 'OTA', order: 8 },
]

function formatMetric(def, value) {
  const format = def.format ?? inferFormat(def.key)
  if (format === 'boolean' || typeof value === 'boolean') return truthy(value) ? 'вкл' : 'выкл'
  if (typeof value !== 'number') return String(value)
  if (format === 'uptime') return formatUptime(Math.floor(value))
  if (format === 'bytes') return formatBytes(value)
  if (format === 'rssi') return `${Math.round(value)} dBm`
  if (format === 'temperature') return `${value.toFixed(1)} °C`
  if (format === 'percent') return `${Math.round(value)} %`
  const num = Number.isInteger(value)
    ? value.toLocaleString('ru-RU')
    : value.toLocaleString('ru-RU', { maximumFractionDigits: 2 })
  return def.unit ? `${num} ${def.unit}` : num
}

function inferFormat(key) {
  if (key === 'uptime') return 'uptime'
  if (key === 'heap' || key === 'free_heap') return 'bytes'
  if (key === 'rssi') return 'rssi'
  if (key === 'temperature' || key === 'temp') return 'temperature'
  if (key === 'humidity' || key === 'progress') return 'percent'
  return undefined
}

function metricBar(def, value) {
  if (typeof value !== 'number') return ''
  const format = def.format ?? inferFormat(def.key)
  if (format === 'rssi') return rssiBar(value)
  if (format === 'percent') return progressBar(value, 100, 8)
  return ''
}

function formatOtaNotification(alias, telemetry) {
  const progress = typeof telemetry.progress === 'number' ? ` (${Math.round(telemetry.progress)}%)` : ''
  const bar = typeof telemetry.progress === 'number' ? '\n' + progressBar(telemetry.progress, 100, 8) : ''
  return [
    `📦 <b>${escapeHtml(alias)}</b>`,
    `OTA: <b>${escapeHtml(telemetry.ota)}${progress}</b>${bar}`,
  ].join('\n')
}

function helpText() {
  return [
    '🤖 <b>ESP32 Gateway Bot</b>',
    '',
    'Управляйте своими ESP32-устройствами через Telegram.',
    '',
    '━━━━━━━━━━━━━━━━━━',
    '📋 <b>Команды</b>',
    '━━━━━━━━━━━━━━━━━━',
    '',
    '📟 <code>/devices</code> — список устройств',
    '📊 <code>/dashboard</code> или <code>/all</code> — сводка по всем',
    'ℹ️ <code>/status [device]</code> — карточка устройства с кнопками',
    '🎮 <code>/commands [device]</code> — то же, что /status',
    '',
    '━━ <b>Действия</b>',
    '',
    '💡 <code>/led [device] on|off</code> — LED',
    '📸 <code>/capture [device]</code> — снимок с камеры',
    '🔄 <code>/reboot [device]</code> — перезагрузка',
    '',
    '━━ <b>GPIO</b>',
    '',
    '📥 <code>/pin_read [device] &lt;pin&gt;</code> — чтение',
    '📤 <code>/pin_write [device] &lt;pin&gt; &lt;value&gt;</code> — запись',
    '',
    '━━━━━━━━━━━━━━━━━━',
    '',
    `📌 <b>Устройство по умолчанию:</b> ${escapeHtml(defaultAlias)}`,
    ...(devices.size > 1
      ? [`👥 <b>Всего устройств:</b> ${devices.size}`]
      : []),
  ].join('\n')
}

function dashboardText() {
  const all = [...state.values()]
  if (all.length === 0) return '📊 <b>Сводка</b>\n\nНет зарегистрированных устройств.'

  const count = (fn) => all.filter(fn).length
  const online = count((d) => d.status === 'online' && !d.unresponsive)
  const silent = count((d) => d.unresponsive)
  const offline = count((d) => d.status === 'offline' || d.status === 'error')

  const counters = [
    `🟢 ${online}`,
    ...(silent ? [`⚠️ ${silent}`] : []),
    ...(offline ? [`🔴 ${offline}`] : []),
    ...(all.length - online - silent - offline > 0 ? [`⚪️ ${all.length - online - silent - offline}`] : []),
  ].join('   ')

  const lines = ['📊 <b>Сводка по устройствам</b>', counters, '']

  for (const device of all) {
    lines.push(`${deviceEmoji(device)} <b>${escapeHtml(device.alias)}</b>` +
      (device.updatedAt ? `  <i>${timeAgo(device.updatedAt)}</i>` : ''))
    const summary = summaryParts(device)
    if (summary.length) lines.push(`<blockquote>${summary.join('  ·  ')}</blockquote>`)
  }

  return lines.join('\n')
}

/** Короткая строка метрик для сводки: dashboard.summary из скетча или dashboard:true */
function summaryParts(device) {
  const telemetry = device.telemetry ?? {}
  const caps = device.capabilities
  const defs = caps?.metrics?.length ? caps.metrics : FALLBACK_METRICS
  const byKey = new Map(defs.map((d) => [d.key, d]))

  let keys = Array.isArray(caps?.dashboard?.summary) ? caps.dashboard.summary : null
  if (!keys) {
    keys = caps?.metrics?.length
      ? defs.filter((d) => d.dashboard).map((d) => d.key)
      : ['temperature', 'humidity', 'rssi', 'uptime']
  }
  const max = Number(caps?.dashboard?.max_items) || 4

  const parts = []
  for (const key of keys) {
    const def = byKey.get(key) ?? { key, label: key }
    const value = metricValue(telemetry, def)
    if (value === undefined || value === null || value === '') continue
    parts.push(`${metricEmoji(def)} ${escapeHtml(formatMetric(def, value))}`)
    if (parts.length >= max) break
  }
  return parts
}

function devicesText() {
  return '📟 <b>Устройства</b>\n\nВыберите устройство:'
}

// ═══════════════════════════════════════════
//  Keyboard builders
// ═══════════════════════════════════════════

function mainKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '📟 Устройства', callback_data: 'devices' },
        { text: '📊 Статус', callback_data: 'checkin:dashboard' },
      ],
      [
        { text: '📋 Помощь', callback_data: 'checkin:help' },
      ],
    ],
  }
}

function devicesKeyboard() {
  const list = [...state.values()]
  const rows = []
  for (let i = 0; i < list.length; i += 2) {
    rows.push(
      list.slice(i, i + 2).map((d) => ({
        text: `${deviceEmoji(d)} ${d.alias}`,
        callback_data: `dev:${d.alias}`,
      })),
    )
  }
  rows.push([
    { text: '📊 Сводка', callback_data: 'dash' },
    { text: '⟳ Обновить', callback_data: 'devs' },
  ])
  return { inline_keyboard: rows }
}

/** Команды устройства из retained capabilities (как в админке) */
function deviceCommands(device) {
  return device.capabilities?.commands ?? []
}

/**
 * Клавиатура строится из capabilities конкретного устройства:
 *  toggle  — одна кнопка с текущим состоянием, нажатие переключает
 *  range   — ➖ [значение] ➕ с шагом step (по умолчанию 10% диапазона)
 *  trigger — кнопка; опасные (reboot и т.п.) через подтверждение
 */
function deviceKeyboard(device) {
  const alias = device.alias
  const rows = []
  const pending = []
  const flush = () => {
    for (let i = 0; i < pending.length; i += 2) rows.push(pending.slice(i, i + 2))
    pending.length = 0
  }

  deviceCommands(device).forEach((cmd, idx) => {
    if (cmd.type === 'toggle') {
      const on = toggleValue(device, cmd)
      const stateText = on === undefined ? '' : on ? ' · вкл' : ' · выкл'
      pending.push({
        text: `${on ? '🟢' : on === false ? '⚫️' : commandEmoji(cmd)} ${cmd.title}${stateText}`,
        callback_data: `c:${alias}:${idx}`,
      })
      return
    }

    if (cmd.type === 'range') {
      flush()
      const current = rangeValue(device, cmd)
      const step = rangeStep(cmd)
      const base = current ?? cmd.min ?? 0
      rows.push([
        { text: '➖', callback_data: `r:${alias}:${idx}:${clampRange(cmd, base - step)}` },
        {
          text: `${commandEmoji(cmd)} ${cmd.title}${current !== undefined ? ` · ${current}` : ''}`,
          callback_data: 'noop',
        },
        { text: '➕', callback_data: `r:${alias}:${idx}:${clampRange(cmd, base + step)}` },
      ])
      return
    }

    pending.push({
      text: `${commandEmoji(cmd)} ${cmd.title}`,
      callback_data: isDangerous(cmd) ? `ask:${alias}:${idx}` : `c:${alias}:${idx}`,
    })
  })

  const hasCaptureCmd = deviceCommands(device).some((c) => c.action === 'capture')
  if (!hasCaptureCmd && (device.telemetry?.capture_url || device.telemetry?.camera_ready !== undefined)) {
    pending.push({ text: '📸 Снимок', callback_data: `cap:${alias}` })
  }
  flush()

  rows.push([
    { text: '⟳ Обновить', callback_data: `ref:${alias}` },
    { text: '← Устройства', callback_data: 'devs' },
  ])
  return { inline_keyboard: rows }
}

function toggleValue(device, cmd) {
  const raw = device.telemetry?.[cmd.action]
  if (raw === undefined || raw === null) return undefined
  return truthy(raw)
}

function rangeValue(device, cmd) {
  const raw = Number(device.telemetry?.[cmd.action])
  return Number.isFinite(raw) ? raw : undefined
}

function rangeStep(cmd) {
  if (Number(cmd.step) > 0) return Number(cmd.step)
  const min = Number.isFinite(cmd.min) ? cmd.min : 0
  const max = Number.isFinite(cmd.max) ? cmd.max : 100
  return Math.max(1, Math.round((max - min) / 10))
}

function clampRange(cmd, value) {
  const min = Number.isFinite(cmd.min) ? cmd.min : 0
  const max = Number.isFinite(cmd.max) ? cmd.max : 100
  return Math.round(Math.max(min, Math.min(max, value)))
}

function isDangerous(cmd) {
  return /reboot|restart|reset|format|erase|ota/i.test(cmd.action)
}

function normalizeCapabilities(payload) {
  if (!payload || typeof payload !== 'object') return null
  const commands = Array.isArray(payload.commands)
    ? payload.commands.filter((c) => c && typeof c.action === 'string')
        .map((c) => ({ ...c, title: c.title || c.action }))
    : []
  const metrics = Array.isArray(payload.metrics) ? payload.metrics : []
  const dashboard = payload.dashboard && typeof payload.dashboard === 'object' ? payload.dashboard : null
  return { commands, metrics, dashboard }
}

// ── Emoji ────────────────────────────────────

const ICON_EMOJI = {
  lightbulb: '💡', 'rotate-cw': '🔄', 'refresh-cw': '🔄', zap: '⚡️', send: '📤',
  camera: '📸', power: '⏻', fan: '🌀', bell: '🔔', circle: '⚪️', dot: '⚪️',
  sun: '☀️', thermometer: '🌡️', globe: '🌐', signal: '📶', wifi: '📶',
  clock: '⏱', memory: '🧠', cpu: '🔧', droplets: '💧', battery: '🔋', gauge: '📈',
}

function commandEmoji(cmd) {
  return ICON_EMOJI[cmd.icon] ?? (cmd.action === 'reboot' ? '🔄' : '⚡️')
}

function metricEmoji(def) {
  return ICON_EMOJI[def.icon] ?? '▫️'
}

function groupEmoji(name) {
  const n = name.toLowerCase()
  if (n.includes('сет')) return '🌐'
  if (n.includes('систем')) return '💻'
  if (n.includes('окруж') || n.includes('климат')) return '🌡️'
  if (n.includes('ota')) return '📦'
  if (n.includes('камер')) return '📸'
  return '📍'
}

function deviceEmoji(device) {
  if (device.unresponsive) return '⚠️'
  return statusEmoji(device.status)
}

function statusLabel(device) {
  if (device.unresponsive) return 'не отвечает'
  if (device.status === 'online') return 'в сети'
  if (device.status === 'offline') return 'офлайн'
  if (device.status === 'error') return 'ошибка'
  return 'нет данных'
}

function truthy(value) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') return ['true', '1', 'on'].includes(value.toLowerCase().trim())
  return Boolean(value)
}

// ═══════════════════════════════════════════
//  Utility — formatting
// ═══════════════════════════════════════════

function statusEmoji(status) {
  if (status === 'online') return '🟢'
  if (status === 'offline') return '🔴'
  if (status === 'error') return '🚨'
  return '⚪️'
}

function timeAgo(date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)

  if (seconds < 5) return 'только что'
  if (seconds < 60) return `${seconds} сек назад`
  if (seconds < 120) return '1 мин назад'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} мин назад`
  if (seconds < 7200) return '1 ч назад'
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} ч назад`
  if (seconds < 172800) return 'вчера'
  if (seconds < 604800) return `${Math.floor(seconds / 86400)} дн назад`

  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function progressBar(value, max, length) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  const filled = Math.round((pct / 100) * length)
  return '█'.repeat(filled) + '░'.repeat(length - filled)
}

function rssiBar(rssi) {
  // RSSI ranges from ~ -100 (poor) to ~ -30 (excellent)
  const normalized = Math.max(0, Math.min(100, ((rssi + 100) / 70) * 100))
  const filled = Math.round((normalized / 100) * 8)
  return '█'.repeat(filled) + '░'.repeat(8 - filled)
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

// ═══════════════════════════════════════════
//  Utility — MQTT / payload
// ═══════════════════════════════════════════

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

function validatePayload(payload) {
  if (!payload || typeof payload.action !== 'string') return false
  if ('pin' in payload && !Number.isFinite(payload.pin)) return false
  if ('value' in payload && !Number.isFinite(payload.value) && typeof payload.value !== 'boolean') return false
  return true
}

// ═══════════════════════════════════════════
//  Utility — general
// ═══════════════════════════════════════════

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

// ═══════════════════════════════════════════
//  Utility — Telegram API
// ═══════════════════════════════════════════

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

/** Правит сообщение с кнопкой (если есть), иначе отправляет новое */
async function render(chatId, messageId, text, replyMarkup) {
  if (messageId) {
    try {
      return await telegram('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      })
    } catch (error) {
      if (/message is not modified/i.test(error.message)) return
      // Сообщение слишком старое/удалено — отправим новое
    }
  }
  return sendMessage(chatId, text, replyMarkup)
}

async function sendPhoto(chatId, url, replyMarkup) {
  return telegram('sendPhoto', {
    chat_id: chatId,
    photo: url,
    parse_mode: 'HTML',
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

// ═══════════════════════════════════════════
//  Lifecycle
// ═══════════════════════════════════════════

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function shutdown() {
  console.log('[telegram] shutting down')
  mqttClient.end(true, () => process.exit(0))
}
