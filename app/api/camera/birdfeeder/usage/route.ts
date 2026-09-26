import { NextResponse } from 'next/server'
import { cameraCorsHeaders } from '@/lib/camera-auth'
import { getBirdAiUsage } from '@/lib/bird-ai-usage'

export const dynamic = 'force-dynamic'

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cameraCorsHeaders })
}

/** Расход модели распознавания птиц в USD: остаток кредитов, по дням, средняя цена снимка */
export async function GET() {
  try {
    const usage = await getBirdAiUsage()
    return NextResponse.json(usage, {
      headers: { ...cameraCorsHeaders, 'Cache-Control': 'no-store' },
    })
  } catch (e) {
    console.error('[BirdAI] usage failed:', e)
    return NextResponse.json({ error: 'unavailable' }, { status: 503, headers: cameraCorsHeaders })
  }
}
