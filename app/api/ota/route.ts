import { NextResponse, type NextRequest } from 'next/server'
import { getServiceClient } from '@/lib/supabase/server'
import { commandTopic } from '@/lib/commands'
import { publishCommand } from '@/lib/mqtt'
import { promises as fs } from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const deviceId = formData.get('deviceId') as string | null

    if (!file || !deviceId) {
      return NextResponse.json(
        { error: 'Требуются файл и deviceId' },
        { status: 400 }
      )
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // Папка для прошивок
    const firmwareDir = path.join(process.cwd(), 'public', 'firmware')
    
    // Убедимся, что папка существует
    await fs.mkdir(firmwareDir, { recursive: true })

    // Генерируем уникальное имя файла (только .bin)
    const timestamp = Date.now()
    const filename = `${deviceId}_${timestamp}.bin`
    const filepath = path.join(firmwareDir, filename)

    // Сохраняем файл локально на сервере
    await fs.writeFile(filepath, buffer)

    // Формируем URL для скачивания файла
    // Если Next.js стоит за reverse proxy, берем хост и протокол оттуда
    const host = req.headers.get('host') || 'localhost:3000'
    const protocol = req.headers.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https')
    const url = `${protocol}://${host}/api/firmware/${filename}`

    // Отправляем команду в MQTT
    const topic = commandTopic(deviceId)
    const payload = { action: 'ota', url }
    const supabase = getServiceClient()

    try {
      await publishCommand(topic, payload)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'MQTT publish failed'
      console.log('[v0] OTA publish error:', message)
      await supabase.from('commands').insert({
        device_id: deviceId,
        topic,
        payload,
        status: 'failed',
      })
      return NextResponse.json({ error: `MQTT: ${message}` }, { status: 502 })
    }

    // Логируем успешную команду в аудит (БД)
    const { error } = await supabase.from('commands').insert({
      device_id: deviceId,
      topic,
      payload,
      status: 'sent',
    })
    if (error) console.log('[v0] OTA audit insert error:', error.message)

    return NextResponse.json({ ok: true, url })

  } catch (err) {
    console.error('OTA Upload error:', err)
    return NextResponse.json(
      { error: 'Внутренняя ошибка сервера при обработке OTA' },
      { status: 500 }
    )
  }
}
