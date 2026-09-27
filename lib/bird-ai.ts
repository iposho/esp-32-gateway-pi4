import { generateText, type LanguageModelUsage, type ProviderMetadata } from 'ai'
import { decode as decodeJpeg } from 'jpeg-js'

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

/** Частые гости кормушек в Армении — подсказка модели, а не жёсткий список */
const REGION_SPECIES = [
  'Большая синица (Parus major)',
  'Лазоревка (Cyanistes caeruleus)',
  'Домовый воробей (Passer domesticus)',
  'Полевой воробей (Passer montanus)',
  'Черногрудый воробей (Passer hispaniolensis)',
  'Зяблик (Fringilla coelebs)',
  'Щегол (Carduelis carduelis)',
  'Зеленушка (Chloris chloris)',
  'Канареечный вьюрок (Serinus serinus)',
  'Чёрный дрозд (Turdus merula)',
  'Зарянка (Erithacus rubecula)',
  'Обыкновенный скворец (Sturnus vulgaris)',
  'Сирийский дятел (Dendrocopos syriacus)',
  'Кольчатая горлица (Streptopelia decaocto)',
  'Малая горлица (Spilopelia senegalensis)',
  'Сизый голубь (Columba livia)',
  'Сорока (Pica pica)',
  'Серая ворона (Corvus cornix)',
  'Галка (Coloeus monedula)',
]

export function isBirdAiEnabled(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY) && process.env.BIRD_AI_DISABLED !== '1'
}

export function getBirdAiModel(): string {
  return process.env.BIRD_AI_MODEL || DEFAULT_MODEL
}

const DEFAULT_MIN_LUMA = 40

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

export type BirdAiResult = {
  bird: boolean
  count: number
  species: string | null
  latin: string | null
  confidence: number
  model: string
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
function buildPrompt(): string {
  const region = process.env.BIRDFEEDER_REGION || DEFAULT_REGION
  return [
    `Photo from a cheap ESP32 camera looking at a bird feeder tray (${region}).`,
    'The pale surface in the lower part of the frame is the tray with seeds and husks.',
    'Ignore the timestamp in the bottom-left corner.',
    '',
    'Camera defects, do not treat them as evidence either way:',
    '- overexposed white or light-grey areas turn pink/magenta;',
    '- the lens is focused far, so anything close to the camera is very blurry.',
    '',
    'Birds often come very close to the lens. A bird may then fill a large part of the frame,',
    'be cut off by the frame edge and look like a soft grey, brown or white blob with feather',
    'texture, a rounded body, a wing, a tail or a head without visible details.',
    'Such a close, blurry bird still counts: bird=true, species=null unless features are clear.',
    '',
    'The photo was taken by a motion detector, so sometimes there is no bird at all:',
    'branches, shadows, lighting changes, insects, cats, people, hands, clothing. Then bird=false.',
    '',
    'Name the species only if visible features (plumage, beak shape, size) make you sure.',
    'If there is a bird but the species is unclear, use species=null and confidence=0. Do not guess.',
    `Common visitors here: ${REGION_SPECIES.join(', ')}. Other regional species are possible.`,
    '',
    'Reply with ONLY this JSON object, no markdown, no other text, keys exactly as shown:',
    '{"bird": true or false, "count": number of birds, "species": "Russian common name" or null,',
    ' "latin": "Latin name" or null, "confidence": 0..1}',
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

function parseReply(
  text: string,
): Omit<BirdAiResult, 'model' | 'inputTokens' | 'outputTokens' | 'costUsd'> {
  const raw = extractJson(text)
  const count = toNumber(pick(raw, ['count', 'bird_count', 'birds', 'количество']))
  let bird = toBool(pick(raw, ['bird', 'is_bird', 'has_bird', 'bird_present', 'answer', 'есть птица', 'птица', 'ответ']))
  if (bird === null && count !== null) bird = count > 0
  if (bird === null) throw new Error(`model reply has no "bird": ${JSON.stringify(raw).slice(0, 200)}`)

  const species = bird ? toName(pick(raw, ['species', 'species_ru', 'name', 'вид'])) : null
  let confidence = toNumber(pick(raw, ['confidence', 'species_confidence', 'уверенность'])) ?? 0
  if (confidence > 1) confidence /= 100
  return {
    bird,
    count: bird ? Math.max(1, Math.round(count ?? 1)) : 0,
    species,
    latin: species ? toName(pick(raw, ['latin', 'species_latin', 'scientific_name', 'латинское название'])) : null,
    confidence: species ? Math.min(1, Math.max(0, confidence)) : 0,
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

export async function classifyBirdPhoto(jpeg: ArrayBuffer): Promise<BirdAiResult> {
  const model = getBirdAiModel()
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
          { type: 'text', text: buildPrompt() },
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
    inputTokens: usage.inputTokens ?? null,
    outputTokens: usage.outputTokens ?? null,
    costUsd,
  }
}
