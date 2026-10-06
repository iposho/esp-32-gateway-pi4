import { type NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase/server'
import {
  type BirdAiCostError,
  type BirdAiResult,
  classifyBirdPhoto,
  getBirdAiMinBirdConfidence,
  getBirdAiModel,
  isBirdAiEnabled,
  passesBirdThreshold,
  shrinkJpeg,
} from '@/lib/bird-ai'
import { addExtraSpent, reserveExtraCalls } from '@/lib/bird-classifier'
import { loadBirdPhoto } from '@/lib/bird-photos'
import { normalizeSpecies } from '@/lib/bird-species'
import { getBirdfeederDeviceId } from '@/lib/birdfeeder'

export const dynamic = 'force-dynamic'

/*
 * Проверка модели и промпта на размеченных снимках из архива (scripts/015):
 *   POST /api/birdfeeder/eval?limit=20&model=<id>&reference=stored|none — запустить
 *   GET  /api/birdfeeder/eval — состояние: идёт (сколько снимков готово) и последний результат
 * Прогон идёт в фоне: 20 снимков — около минуты, а прокси перед шлюзом рвёт долгие
 * запросы, и оплаченный результат терялся. POST отвечает сразу (202), страница
 * опрашивает GET. Последний результат хранится в памяти процесса до рестарта admin.
 *
 * Прогоняет последние `limit` снимков с label_bird через текущий промпт и считает
 * точность и полноту «птица/нет», точность вида и цену. Рядом — те же метрики
 * для ответов, сохранённых в БД, по версиям промпта: так видно «до» и «после».
 * В БД не пишет. Вызовы платные и входят в дневной лимит, поэтому limit ≤ 50.
 * Только вход в админку.
 */

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50
/** Пороги bird_confidence: что было бы, если считать птицей только уверенные ответы */
const THRESHOLDS = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8]

type LabeledRow = {
  id: number
  is_bird: boolean | null
  bird_confidence: number | null
  species: string | null
  species_latin: string | null
  prompt_version: string | null
  photo_path: string
  reference_path: string | null
  label_bird: boolean
  label_species_latin: string | null
}

type Answer = { bird: boolean; birdConfidence: number | null; species: string | null; latin: string | null }
type Labeled = { label: boolean; labelKey: string | null; answer: Answer }

function metrics(items: Labeled[], threshold = 0) {
  let tp = 0
  let fp = 0
  let fn = 0
  let tn = 0
  let speciesTotal = 0
  let speciesOk = 0
  for (const { label, labelKey, answer } of items) {
    const bird = passesBirdThreshold(answer, threshold)
    if (bird && label) tp++
    else if (bird) fp++
    else if (label) fn++
    else tn++
    if (label && labelKey && bird) {
      speciesTotal++
      if (normalizeSpecies(answer.species, answer.latin).key === labelKey) speciesOk++
    }
  }
  const ratio = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 1000 : null)
  return {
    n: items.length,
    tp,
    fp,
    fn,
    tn,
    /** Доля настоящих птиц среди ответов «птица» */
    precision: ratio(tp, tp + fp),
    /** Доля найденных среди всех птиц */
    recall: ratio(tp, tp + fn),
    /** Вид угадан среди найденных птиц с размеченным видом */
    speciesAccuracy: ratio(speciesOk, speciesTotal),
  }
}

type EvalReport = Awaited<ReturnType<typeof runEval>>

type EvalJob = {
  /** Идущий прогон; null — ничего не идёт */
  run: { startedAt: string; done: number; total: number; model: string } | null
  last: { finishedAt: string; report: EvalReport } | null
  /** Ошибка последнего запуска, если он не дошёл до конца */
  error: string | null
}

// globalThis: POST и GET могут оказаться в разных копиях модуля
const job = ((globalThis as unknown as { __birdEval?: EvalJob }).__birdEval ??= {
  run: null,
  last: null,
  error: null,
})

export type BirdEvalState = EvalJob

function state(): EvalJob {
  return { run: job.run, last: job.last, error: job.error }
}

export async function POST(request: NextRequest) {
  if (!isBirdAiEnabled()) {
    return NextResponse.json({ error: 'AI_GATEWAY_API_KEY is not set' }, { status: 503 })
  }
  if (job.run) {
    return NextResponse.json({ ...state(), error: 'eval is already running' }, { status: 409 })
  }
  const params = request.nextUrl.searchParams
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(params.get('limit')) || DEFAULT_LIMIT))
  const model = params.get('model') || getBirdAiModel()
  const useReference = params.get('reference') !== 'none'

  const { data, error } = await getServiceClient()
    .from('bird_detections')
    .select(
      'id, is_bird, bird_confidence, species, species_latin, prompt_version, photo_path, reference_path, label_bird, label_species_latin',
    )
    .eq('device_id', getBirdfeederDeviceId())
    .not('label_bird', 'is', null)
    .not('photo_path', 'is', null)
    .order('id', { ascending: false })
    .limit(limit)
  if (error) return NextResponse.json({ error: `${error.message} (scripts/015?)` }, { status: 503 })
  const rows = (data ?? []) as LabeledRow[]
  if (rows.length === 0) {
    return NextResponse.json({ error: 'no labeled photos: set label_bird in bird_detections' }, { status: 404 })
  }
  if (!reserveExtraCalls(rows.length)) {
    return NextResponse.json({ error: `daily limit: no room for ${rows.length} calls` }, { status: 429 })
  }

  // Прогон в фоне: ответ уходит сразу, результат заберёт GET
  job.run = { startedAt: new Date().toISOString(), done: 0, total: rows.length, model }
  job.error = null
  void runEval(rows, model, useReference, (done) => {
    if (job.run) job.run.done = done
  })
    .then((report) => {
      job.last = { finishedAt: new Date().toISOString(), report }
    })
    .catch((e: unknown) => {
      job.error = (e as Error).message
      console.error('[BirdAI] eval failed:', e)
    })
    .finally(() => {
      job.run = null
    })
  return NextResponse.json(state(), { status: 202, headers: { 'Cache-Control': 'no-store' } })
}

export async function GET() {
  return NextResponse.json(state(), { headers: { 'Cache-Control': 'no-store' } })
}

async function runEval(
  rows: LabeledRow[],
  model: string,
  useReference: boolean,
  onProgress: (done: number) => void,
) {
  const labelKey = (r: LabeledRow) =>
    r.label_bird && r.label_species_latin ? normalizeSpecies(null, r.label_species_latin).key : null

  const results: Array<{ id: number; label: boolean; error?: string } & Partial<BirdAiResult>> = []
  const current: Labeled[] = []
  let costUsd = 0
  let ms = 0
  for (const r of rows) {
    const startedAt = Date.now()
    try {
      const photo = await loadBirdPhoto(r.photo_path)
      const reference =
        useReference && r.reference_path
          ? await loadBirdPhoto(r.reference_path).then((b) => shrinkJpeg(b) ?? b)
          : null
      const res = await classifyBirdPhoto(photo, { model, reference })
      addExtraSpent(res.costUsd)
      costUsd += res.costUsd ?? 0
      ms += Date.now() - startedAt
      results.push({ id: r.id, label: r.label_bird, ...res })
      current.push({ label: r.label_bird, labelKey: labelKey(r), answer: res })
    } catch (e) {
      const cost = (e as BirdAiCostError).costUsd
      addExtraSpent(cost)
      costUsd += cost ?? 0
      results.push({ id: r.id, label: r.label_bird, error: (e as Error).message })
    }
    onProgress(results.length)
  }

  // Ответы из БД на тех же снимках — по версиям промпта
  const stored = new Map<string, Labeled[]>()
  for (const r of rows) {
    if (r.is_bird === null) continue
    const version = r.prompt_version ?? 'до v3'
    const list = stored.get(version) ?? []
    list.push({
      label: r.label_bird,
      labelKey: labelKey(r),
      answer: { bird: r.is_bird, birdConfidence: r.bird_confidence, species: r.species, latin: r.species_latin },
    })
    stored.set(version, list)
  }

  return {
    model,
    reference: useReference,
    /** Порог, с которым работает цикл (BIRD_AI_MIN_BIRD_CONFIDENCE); current — без порога */
    minBirdConfidence: getBirdAiMinBirdConfidence(),
    current: {
      ...metrics(current),
      byThreshold: [...new Set([...THRESHOLDS, getBirdAiMinBirdConfidence()])]
        .sort((a, b) => a - b)
        .map((t) => ({ threshold: t, ...metrics(current, t) })),
      errors: results.filter((r) => r.error).length,
      costUsd,
      avgCostUsd: current.length ? costUsd / current.length : null,
      avgMs: current.length ? Math.round(ms / current.length) : null,
    },
    stored: Object.fromEntries([...stored].map(([v, items]) => [v, metrics(items)])),
    results,
  }
}
