import { generateText, type LanguageModelUsage, type ProviderMetadata } from 'ai'
import { decode as decodeJpeg, encode as encodeJpeg } from 'jpeg-js'
import { normalizeSpecies, REGION_SPECIES } from '@/lib/bird-species'

/**
 * Распознавание птиц на снимке с кормушки через Vercel AI Gateway.
 * Ключ — AI_GATEWAY_API_KEY, модель — BIRD_AI_MODEL (любая с тегом vision
 * из https://ai-gateway.vercel.sh/v1/models).
 */

const DEFAULT_MODEL = 'xiaomi/mimo-v2.6-flash'
const DEFAULT_REGION = 'Ереван, Армения'
/** Тег запросов в AI Gateway: по нему строится отчёт о расходах кормушки */
export const BIRD_AI_TAG = 'birdfeeder'
const MODELS_URL = 'https://ai-gateway.vercel.sh/v1/models'
const PRICING_TTL_MS = 24 * 60 * 60_000

export function isBirdAiEnabled(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY) && process.env.BIRD_AI_DISABLED !== '1'
}

export function getBirdAiModel(): string {
  return process.env.BIRD_AI_MODEL || DEFAULT_MODEL
}

const DEFAULT_MIN_LUMA = 40

/**
 * Птицей считается ответ «птица» с bird_confidence не ниже порога (0..1).
 * По умолчанию 0 — как ответила модель. Порог выбирают по /api/birdfeeder/eval
 * (byThreshold) на размеченных снимках: выше порог — меньше ложных «да», но
 * больше пропущенных птиц. Ответ без bird_confidence порог проходит.
 */
export function getBirdAiMinBirdConfidence(): number {
  const n = Number(process.env.BIRD_AI_MIN_BIRD_CONFIDENCE)
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : 0
}

/** Решение «птица или нет» с учётом порога BIRD_AI_MIN_BIRD_CONFIDENCE */
export function passesBirdThreshold(
  r: { bird: boolean; birdConfidence: number | null },
  threshold = getBirdAiMinBirdConfidence(),
): boolean {
  return r.bird && (r.birdConfidence ?? 1) >= threshold
}

/** Снимки темнее этого (средняя яркость 0..255) в модель не отправляются */
export function getBirdAiMinLuma(): number {
  const n = Number(process.env.BIRD_AI_MIN_LUMA)
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_MIN_LUMA
}

/**
 * Средняя яркость снимка 0..255, как считает прошивка (Y = 0.3R + 0.59G + 0.11B),
 * по каждому 4-му пикселю. null — JPEG не разобрался, тогда снимок уходит в модель.
 */
export function photoLuma(jpeg: ArrayBuffer): number | null {
  try {
    const img = decodeJpeg(new Uint8Array(jpeg), {
      useTArray: true,
      formatAsRGBA: false,
      maxResolutionInMP: 4,
    })
    const { data } = img
    let sum = 0
    let n = 0
    for (let i = 0; i + 2 < data.length; i += 12) {
      sum += (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8
      n++
    }
    return n ? Math.round(sum / n) : null
  } catch {
    return null
  }
}

/**
 * Версия промпта пишется в bird_detections.prompt_version: по ней видно, с каким
 * промптом получен ответ, и /api/birdfeeder/eval сравнивает версии на размеченных снимках.
 * Меняете buildPrompt — поднимите версию.
 */
export const BIRD_PROMPT_VERSION = 'v3-reference'

/** Ширина кадра для сравнения: ему хватает общей картины, а токены картинки — главная цена вызова */
const REFERENCE_WIDTH = 320

/**
 * Кадр для сравнения (пункт «пустая кормушка»): удваивает картинки в запросе,
 * поэтому выключен по умолчанию. Включать — BIRD_AI_REFERENCE=1, если
 * /api/birdfeeder/eval покажет, что он окупается точностью.
 */
export function isBirdAiReferenceEnabled(): boolean {
  return process.env.BIRD_AI_REFERENCE === '1'
}

/** Уменьшенная копия JPEG (усреднение блоков); null — не разобрался или уже маленький */
export function shrinkJpeg(jpeg: ArrayBuffer, maxWidth = REFERENCE_WIDTH): ArrayBuffer | null {
  try {
    const img = decodeJpeg(new Uint8Array(jpeg), { useTArray: true, formatAsRGBA: true, maxResolutionInMP: 4 })
    const k = Math.ceil(img.width / maxWidth)
    if (k <= 1) return null
    const width = Math.floor(img.width / k)
    const height = Math.floor(img.height / k)
    const out = new Uint8Array(width * height * 4)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        for (let c = 0; c < 3; c++) {
          let sum = 0
          for (let dy = 0; dy < k; dy++) {
            const row = (y * k + dy) * img.width
            for (let dx = 0; dx < k; dx++) sum += img.data[(row + x * k + dx) * 4 + c]
          }
          out[(y * width + x) * 4 + c] = sum / (k * k)
        }
        out[(y * width + x) * 4 + 3] = 255
      }
    }
    const { data } = encodeJpeg({ data: out, width, height }, 70)
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
  } catch {
    return null
  }
}

export type BirdAiResult = {
  bird: boolean
  /** Уверенность модели, что птица на снимке есть, 0..1 */
  birdConfidence: number | null
  count: number
  species: string | null
  latin: string | null
  /** Уверенность в виде, 0..1; 0 — вид не назван */
  confidence: number
  model: string
  promptVersion: string
  /** Модели показали кадр для сравнения */
  withReference: boolean
  inputTokens: number | null
  outputTokens: number | null
  /** Цена вызова в USD: из ответа Gateway, иначе по токенам и прайсу модели */
  costUsd: number | null
}

/** Ошибка после ответа модели: токены уже оплачены */
export type BirdAiCostError = Error & { costUsd?: number | null }

/*
 * Output.object здесь не годится: mimo-v2.6-flash заявлен со structured output,
 * но схему игнорирует и отвечает произвольным JSON («есть птица»: «нет»).
 * Поэтому просим JSON словами и разбираем ответ терпимо к ключам и типам.
 */
function buildPrompt(withReference: boolean): string {
  const region = process.env.BIRDFEEDER_REGION || DEFAULT_REGION
  const species = REGION_SPECIES.map((s) => `${s.ru} (${s.latin})`).join(', ')
  return [
    withReference
      ? `Two photos from the same cheap ESP32 camera looking at a bird feeder tray (${region}).\n` +
        'IMAGE 1 is a recent reference frame of the same scene WITHOUT birds.\n' +
        'IMAGE 2 is the photo to check. Answer only about IMAGE 2: compare it with IMAGE 1 to see what changed.\n' +
        'Light, shadows and seeds on the tray may differ between the two; that alone is not a bird.'
      : `Photo from a cheap ESP32 camera looking at a bird feeder tray (${region}).`,
    'The pale surface in the lower part of the frame is the tray with seeds and husks.',
    'Ignore the timestamp in the bottom-left corner.',
    '',
    'Camera defects, do not treat them as evidence either way:',
    '- overexposed white or light-grey areas turn pink/magenta;',
    '- the lens is focused far, so anything close to the camera is very blurry.',
    '',
    'The photo was taken by a motion detector, and most such photos have NO bird:',
    'moving branches and leaves, shadows, lighting changes, glare, insects, cats, people, hands, clothing.',
    '',
    'A bird close to the lens can be blurry and cut off by the frame edge. Count it as a bird only if',
    'something bird-specific is visible: a beak, an eye, feather texture, a wing or tail shape,',
    'or a bird head and body silhouette. A shapeless blur, a leaf, a shadow or a patch of colour is not a bird.',
    'If you are unsure, still answer, but set bird_confidence low (below 0.5).',
    '',
    'Name the species only if visible features (plumage, beak shape, size) make you sure.',
    'If there is a bird but the species is unclear, use species=null. Do not guess.',
    `Common visitors here: ${species}. Other regional species are possible.`,
    'If the bird is one of these, copy its Russian and Latin names exactly as written above.',
    '',
    'Reply with ONLY this JSON object, no markdown, no other text, keys exactly as shown:',
    '{"bird": true or false, "bird_confidence": 0..1 (how sure you are a bird is present),',
    ' "count": number of birds, "species": "Russian common name" or null,',
    ' "latin": "Latin name" or null, "species_confidence": 0..1}',
  ].join('\n')
}

function extractJson(text: string): Record<string, unknown> {
  const from = text.indexOf('{')
  const to = text.lastIndexOf('}')
  if (from >= 0 && to > from) {
    try {
      const value = JSON.parse(text.slice(from, to + 1))
      if (value && typeof value === 'object' && !Array.isArray(value)) return value
    } catch {
      // ниже — общая ошибка с началом ответа
    }
  }
  throw new Error(`model reply is not JSON: ${text.slice(0, 200).replace(/\s+/g, ' ')}`)
}

/** Значение по первому подходящему ключу, без учёта регистра, пробелов и «_» */
function pick(obj: Record<string, unknown>, aliases: string[]): unknown {
  const norm = (k: string) => k.toLowerCase().replace(/[\s_-]/g, '')
  const wanted = new Set(aliases.map(norm))
  for (const [k, v] of Object.entries(obj)) if (wanted.has(norm(k))) return v
  return undefined
}

function toBool(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v > 0
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase()
    if (['true', 'yes', 'да', '1'].includes(s)) return true
    if (['false', 'no', 'нет', '0'].includes(s)) return false
  }
  return null
}

function toNumber(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v.replace('%', '').replace(',', '.')) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

function toName(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s && !['null', 'none', 'unknown', 'неизвестно'].includes(s.toLowerCase()) ? s : null
}

/** Число 0..1; проценты («80», «80%») приводятся к долям */
function toUnit(v: unknown): number | null {
  let n = toNumber(v)
  if (n === null) return null
  if (n > 1) n /= 100
  return Math.min(1, Math.max(0, n))
}

/** Больше на одном снимке кормушки не бывает: выдумка модели не должна стать рекордом */
const MAX_BIRD_COUNT = 20

function parseReply(
  text: string,
): Pick<BirdAiResult, 'bird' | 'birdConfidence' | 'count' | 'species' | 'latin' | 'confidence'> {
  const raw = extractJson(text)
  const count = toNumber(pick(raw, ['count', 'bird_count', 'birds', 'количество']))
  let bird = toBool(pick(raw, ['bird', 'is_bird', 'has_bird', 'bird_present', 'answer', 'есть птица', 'птица', 'ответ']))
  if (bird === null && count !== null) bird = count > 0
  if (bird === null) throw new Error(`model reply has no "bird": ${JSON.stringify(raw).slice(0, 200)}`)

  const birdConfidence = toUnit(pick(raw, ['bird_confidence', 'presence_confidence', 'уверенность в птице']))
  const name = bird
    ? normalizeSpecies(
        toName(pick(raw, ['species', 'species_ru', 'name', 'вид'])),
        toName(pick(raw, ['latin', 'species_latin', 'scientific_name', 'латинское название'])),
      )
    : null
  const confidence = toUnit(pick(raw, ['species_confidence', 'confidence', 'уверенность'])) ?? 0
  return {
    bird,
    birdConfidence,
    count: bird ? Math.min(MAX_BIRD_COUNT, Math.max(1, Math.round(count ?? 1))) : 0,
    species: name?.species ?? null,
    latin: name?.species ? name.latin : null,
    confidence: name?.species ? confidence : 0,
  }
}

let pricing: { at: number; byModel: Map<string, { input: number; output: number }> } | null = null

/** Прайс моделей Gateway (USD за токен), раз в сутки */
async function modelPrice(model: string): Promise<{ input: number; output: number } | null> {
  if (!pricing || Date.now() - pricing.at > PRICING_TTL_MS) {
    try {
      const res = await fetch(MODELS_URL, { signal: AbortSignal.timeout(10_000) })
      const body = (await res.json()) as {
        data?: Array<{ id: string; pricing?: { input?: string; output?: string } }>
      }
      const byModel = new Map<string, { input: number; output: number }>()
      for (const m of body.data ?? []) {
        const input = Number(m.pricing?.input)
        const output = Number(m.pricing?.output)
        if (Number.isFinite(input) && Number.isFinite(output)) byModel.set(m.id, { input, output })
      }
      pricing = { at: Date.now(), byModel }
    } catch {
      return pricing?.byModel.get(model) ?? null
    }
  }
  return pricing.byModel.get(model) ?? null
}

async function callCost(
  model: string,
  usage: LanguageModelUsage,
  metadata: ProviderMetadata | undefined,
): Promise<number | null> {
  const reported = Number(metadata?.gateway?.cost)
  if (metadata?.gateway?.cost != null && Number.isFinite(reported)) return reported
  const price = await modelPrice(model)
  if (!price || usage.inputTokens === undefined) return null
  return usage.inputTokens * price.input + (usage.outputTokens ?? 0) * price.output
}

export type ClassifyOptions = {
  /** Свежий кадр той же кормушки без птиц: модель сравнивает с ним */
  reference?: ArrayBuffer | null
  /** Другая модель вместо BIRD_AI_MODEL — для сравнения в /api/birdfeeder/eval */
  model?: string
}

export async function classifyBirdPhoto(jpeg: ArrayBuffer, opts: ClassifyOptions = {}): Promise<BirdAiResult> {
  const model = opts.model || getBirdAiModel()
  const reference = opts.reference ?? null
  const { text, usage, providerMetadata } = await generateText({
    model,
    // Рассуждения оплачиваются как выходные токены и в разы удорожают запрос
    reasoning: 'none',
    maxOutputTokens: 400,
    maxRetries: 1,
    abortSignal: AbortSignal.timeout(45_000),
    providerOptions: { gateway: { tags: [BIRD_AI_TAG] } },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: buildPrompt(reference !== null) },
          ...(reference
            ? [
                { type: 'text' as const, text: 'IMAGE 1 (reference, no birds):' },
                { type: 'file' as const, mediaType: 'image/jpeg', data: new Uint8Array(reference) },
                { type: 'text' as const, text: 'IMAGE 2 (check this one):' },
              ]
            : []),
          { type: 'file', mediaType: 'image/jpeg', data: new Uint8Array(jpeg) },
        ],
      },
    ],
  })

  const costUsd = await callCost(model, usage, providerMetadata)
  let reply: ReturnType<typeof parseReply>
  try {
    reply = parseReply(text)
  } catch (e) {
    throw Object.assign(e as Error, { costUsd })
  }
  return {
    ...reply,
    model,
    promptVersion: BIRD_PROMPT_VERSION,
    withReference: reference !== null,
    inputTokens: usage.inputTokens ?? null,
    outputTokens: usage.outputTokens ?? null,
    costUsd,
  }
}
