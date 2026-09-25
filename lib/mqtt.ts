import mqtt, { type IClientPublishOptions, type MqttClient } from 'mqtt'

/**
 * Серверный MQTT-клиент для ПУБЛИКАЦИИ команд из админки в Mosquitto.
 * Приём сообщений от устройств делает Node-RED (пишет в Supabase).
 *
 * MQTT_URL внутри docker-сети: mqtt://mosquitto:1883
 *
 * Клиент один на процесс: создаётся один раз и сам переподключается.
 * Раньше при каждом publish во время (пере)подключения создавался новый
 * клиент — соединения плодились, а команды ждали очередной handshake.
 */
const PUBLISH_TIMEOUT_MS = 6000

const globalForMqtt = globalThis as unknown as { __mqttClient?: MqttClient }

function getClient(): MqttClient {
  if (globalForMqtt.__mqttClient) return globalForMqtt.__mqttClient

  const url = process.env.MQTT_URL ?? 'mqtt://mosquitto:1883'
  const client = mqtt.connect(url, {
    username: process.env.MQTT_USERNAME || undefined,
    password: process.env.MQTT_PASSWORD || undefined,
    clientId: `esp32-admin-${Math.random().toString(16).slice(2, 8)}`,
    reconnectPeriod: 2000,
    connectTimeout: 5000,
    keepalive: 30,
  })

  client.on('error', (err) => {
    console.log('[v0] MQTT error:', err.message)
  })

  globalForMqtt.__mqttClient = client
  return client
}

function waitConnected(c: MqttClient, timeoutMs: number): Promise<void> {
  if (c.connected) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const onConnect = () => {
      clearTimeout(timer)
      resolve()
    }
    const timer = setTimeout(() => {
      c.removeListener('connect', onConnect)
      reject(new Error('MQTT connect timeout'))
    }, timeoutMs)
    c.once('connect', onConnect)
  })
}

async function publish(
  topic: string,
  message: string,
  options: IClientPublishOptions,
): Promise<void> {
  const c = getClient()
  // Не отдаём сообщение в оффлайн-очередь mqtt.js: иначе при недоступном
  // брокере команда (например reboot) выполнилась бы позже, неожиданно.
  await waitConnected(c, PUBLISH_TIMEOUT_MS)

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('MQTT publish timeout')),
      PUBLISH_TIMEOUT_MS,
    )
    c.publish(topic, message, options, (err) => {
      clearTimeout(timer)
      if (err) reject(err)
      else resolve()
    })
  })
}

/** Опубликовать команду в MQTT. Возвращает промис завершения publish. */
export function publishCommand(
  topic: string,
  payload: Record<string, unknown>,
): Promise<void> {
  return publish(topic, JSON.stringify(payload), { qos: 1, retain: false })
}

/** Удалить retained-сообщение из брокера (пустой payload с retain). */
export function clearRetained(topic: string): Promise<void> {
  return publish(topic, '', { qos: 1, retain: true })
}

// Прогреваем соединение при загрузке модуля, чтобы первая команда не ждала connect.
if (process.env.NEXT_PHASE !== 'phase-production-build') {
  try {
    getClient()
  } catch {
    /* ignore */
  }
}
