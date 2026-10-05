import { NextResponse } from 'next/server'
import { getBirdAiUsage } from '@/lib/bird-ai-usage'

export const dynamic = 'force-dynamic'

/**
 * Расход модели распознавания птиц в USD: остаток кредитов, по дням, средняя цена снимка.
 * Путь нарочно вне /api/camera: там CAMERA_API_TOKEN внешнего сайта, а баланс
 * кредитов всей команды Vercel ему знать незачем. Сюда — только вход в админку.
 */
export async function GET() {
  try {
    const usage = await getBirdAiUsage()
    return NextResponse.json(usage, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error('[BirdAI] usage failed:', e)
    return NextResponse.json({ error: 'unavailable' }, { status: 503 })
  }
}
