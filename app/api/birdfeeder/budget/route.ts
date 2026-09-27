import { type NextRequest, NextResponse } from 'next/server'
import { setBirdAiBudget } from '@/lib/bird-ai-usage'

export const dynamic = 'force-dynamic'

/**
 * Остаток кредитов кормушки, вписанный в дашборде: { amountUsd: number | null }.
 * Путь нарочно вне /api/camera: туда пускает CAMERA_API_TOKEN внешнего сайта,
 * а сюда — только вход в админку (proxy.ts).
 */
export async function PUT(req: NextRequest) {
  let body: { amountUsd?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const { amountUsd } = body
  if (amountUsd !== null && (typeof amountUsd !== 'number' || !Number.isFinite(amountUsd) || amountUsd < 0 || amountUsd > 100_000)) {
    return NextResponse.json({ error: 'amountUsd: число ≥ 0 или null' }, { status: 400 })
  }

  try {
    await setBirdAiBudget(amountUsd)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[BirdAI] budget save failed:', e)
    return NextResponse.json({ error: (e as Error).message }, { status: 503 })
  }
}
