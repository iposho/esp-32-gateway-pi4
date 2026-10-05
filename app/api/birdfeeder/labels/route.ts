import { type NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase/server'
import { getBirdfeederDeviceId } from '@/lib/birdfeeder'
import { normalizeSpecies } from '@/lib/bird-species'

export const dynamic = 'force-dynamic'

/*
 * Разметка снимков из архива (scripts/015) для проверки модели (/api/birdfeeder/eval).
 * Страница — /dashboard/birdfeeder/labels. Только вход в админку: в архиве и снимки
 * без птиц, на которых бывают люди.
 *
 * GET ?filter=…&before=<id> — страница снимков, новые первыми, плюс счётчики разметки.
 * PUT { id, labelBird: boolean | null, speciesLatin: string | null } — записать ответ;
 *     labelBird: null — снять разметку.
 */

const PAGE_SIZE = 24
/** «Спорные»: модель не уверена, есть ли птица */
const UNCERTAIN_FROM = 0.3
const UNCERTAIN_TO = 0.7

const LABEL_FILTERS = ['unlabeled', 'uncertain', 'model-bird', 'model-nobird', 'labeled'] as const
export type LabelFilter = (typeof LABEL_FILTERS)[number]

export type LabelItem = {
  id: number
  shotAt: string
  isBird: boolean | null
  birdConfidence: number | null
  count: number
  species: string | null
  latin: string | null
  confidence: number | null
  promptVersion: string | null
  error: string | null
  labelBird: boolean | null
  labelSpeciesLatin: string | null
}

export type LabelsResponse = {
  items: LabelItem[]
  /** id для следующей страницы; null — дальше снимков нет */
  nextBefore: number | null
  counts: { archived: number; labeled: number; labeledBird: number; labeledNoBird: number }
}

type Row = {
  id: number
  shot_at: string
  is_bird: boolean | null
  bird_confidence: number | null
  bird_count: number
  species: string | null
  species_latin: string | null
  confidence: number | null
  prompt_version: string | null
  error: string | null
  label_bird: boolean | null
  label_species_latin: string | null
}

/** Число снимков в архиве; label: undefined — все, 'any' — размеченные, true — с птицей */
async function countArchived(label?: 'any' | true): Promise<number> {
  let q = getServiceClient()
    .from('bird_detections')
    .select('id', { count: 'exact', head: true })
    .eq('device_id', getBirdfeederDeviceId())
    .not('photo_path', 'is', null)
  if (label === 'any') q = q.filter('label_bird', 'not.is', null)
  if (label === true) q = q.filter('label_bird', 'eq', true)
  const { count, error } = await q
  if (error) throw new Error(error.message)
  return count ?? 0
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const filter = (params.get('filter') ?? 'unlabeled') as LabelFilter
  if (!LABEL_FILTERS.includes(filter)) {
    return NextResponse.json({ error: 'invalid filter' }, { status: 400 })
  }
  const beforeRaw = params.get('before')
  if (beforeRaw !== null && !/^\d+$/.test(beforeRaw)) {
    return NextResponse.json({ error: 'invalid before' }, { status: 400 })
  }

  let query = getServiceClient()
    .from('bird_detections')
    .select(
      'id, shot_at, is_bird, bird_confidence, bird_count, species, species_latin, confidence, prompt_version, error, label_bird, label_species_latin',
    )
    .eq('device_id', getBirdfeederDeviceId())
    .not('photo_path', 'is', null)
  if (filter === 'labeled') query = query.filter('label_bird', 'not.is', null)
  else query = query.is('label_bird', null)
  if (filter === 'uncertain') {
    query = query.gte('bird_confidence', UNCERTAIN_FROM).lte('bird_confidence', UNCERTAIN_TO)
  }
  if (filter === 'model-bird') query = query.eq('is_bird', true)
  if (filter === 'model-nobird') query = query.eq('is_bird', false)
  if (beforeRaw !== null) query = query.lt('id', Number(beforeRaw))

  let page: Awaited<typeof query>
  let archived: number
  let labeled: number
  let labeledBird: number
  try {
    ;[page, archived, labeled, labeledBird] = await Promise.all([
      query.order('id', { ascending: false }).limit(PAGE_SIZE),
      countArchived(),
      countArchived('any'),
      countArchived(true),
    ])
    if (page.error) throw new Error(page.error.message)
  } catch (e) {
    return NextResponse.json({ error: `${(e as Error).message} (scripts/015?)` }, { status: 503 })
  }

  const rows = (page.data ?? []) as Row[]
  const body: LabelsResponse = {
    items: rows.map((r) => {
      const name = normalizeSpecies(r.species, r.species_latin)
      return {
        id: r.id,
        shotAt: r.shot_at,
        isBird: r.is_bird,
        birdConfidence: r.bird_confidence,
        count: r.bird_count,
        species: name.species,
        latin: name.latin,
        confidence: r.confidence,
        promptVersion: r.prompt_version,
        error: r.error,
        labelBird: r.label_bird,
        labelSpeciesLatin: r.label_species_latin,
      }
    }),
    nextBefore: rows.length === PAGE_SIZE ? rows[rows.length - 1].id : null,
    counts: { archived, labeled, labeledBird, labeledNoBird: labeled - labeledBird },
  }
  return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } })
}

export async function PUT(request: NextRequest) {
  let body: { id?: unknown; labelBird?: unknown; speciesLatin?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  const { id, labelBird, speciesLatin } = body
  if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'id: целое число' }, { status: 400 })
  }
  if (labelBird !== null && typeof labelBird !== 'boolean') {
    return NextResponse.json({ error: 'labelBird: true, false или null' }, { status: 400 })
  }
  if (
    speciesLatin !== null &&
    speciesLatin !== undefined &&
    (typeof speciesLatin !== 'string' || speciesLatin.trim().length === 0 || speciesLatin.length > 100)
  ) {
    return NextResponse.json({ error: 'speciesLatin: латинское название или null' }, { status: 400 })
  }

  // Вид — только у птицы; латынь приводим к единому написанию (Parus major)
  const latin =
    labelBird === true && typeof speciesLatin === 'string'
      ? normalizeSpecies(null, speciesLatin).latin
      : null
  const { data, error } = await getServiceClient()
    .from('bird_detections')
    .update({
      label_bird: labelBird,
      label_species_latin: latin,
      labeled_at: labelBird === null ? null : new Date().toISOString(),
    })
    .eq('id', id)
    .eq('device_id', getBirdfeederDeviceId())
    .not('photo_path', 'is', null)
    .select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 503 })
  if (!data?.length) return NextResponse.json({ error: 'no archived photo with this id' }, { status: 404 })
  return NextResponse.json({ ok: true, labelSpeciesLatin: latin })
}
