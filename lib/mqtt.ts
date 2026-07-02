import mqtt, { type MqttClient } from 'mqtt'

/**
 * Серверный MQTT-клиент для ПУБЛИКАЦИИ команд из админки в Mosquitto.
 * Приём сообщений от устройств делает Node-RED (пишет в Supabase).
 *
 * MQTT_URL внутри docker-сети: mqtt://mosquitto:1883
 */
let client: MqttClient | null = null

function getClient(): MqttClient {
  if (client && client.connected) return client

  const url = process.env.MQTT_URL ?? 'mqtt://mosquitto:1883'
  client = mqtt.connect(url, {
    username: process.env.MQTT_USERNAME || undefined,
    password: process.env.MQTT_PASSWORD || undefined,
    clientId: `esp32-admin-${Math.random().toString(16).slice(2, 8)}`,
    reconnectPeriod: 2000,
    connectTimeout: 5000,
  })

  client.on('error', (err) => {
    console.log('[v0] MQTT error:', err.message)
  })

  return client
}

/** Опубликовать команду в MQTT. Возвращает промис завершения publish. */
export function publishCommand(
  topic: string,
  payload: Record<string, unknown>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const c = getClient()
    const message = JSON.stringify(payload)

    const doPublish = () => {
      c.publish(topic, message, { qos: 1, retain: false }, (err) => {
        if (err) reject(err)
        else resolve()
      })
    }

    if (c.connected) {
      doPublish()
    } else {
      c.once('connect', doPublish)
      c.once('error', (err) => reject(err))
      setTimeout(() => reject(new Error('MQTT connect timeout')), 6000)
    }
  })
}
