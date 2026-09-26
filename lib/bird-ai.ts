import { generateText, Output } from 'ai'
import { z } from 'zod'

/**
 * Распознавание птиц на снимке с кормушки через Vercel AI Gateway.
 * Ключ — AI_GATEWAY_API_KEY, модель — BIRD_AI_MODEL (любая с тегом vision
 * из https://ai-gateway.vercel.sh/v1/models).
 */

const DEFAULT_MODEL = 'xiaomi/mimo-v2.6-flash'
const DEFAULT_REGION = 'Ереван, Армения'

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

const resultSchema = z.object({
  bird: z.boolean().describe('Есть ли на снимке живая птица'),
  count: z.number().int().min(0).max(50).describe('Сколько птиц видно'),
  species: z
    .string()
    .nullable()
    .describe('Русское название вида самой заметной птицы; null, если птицы нет или вид не определить'),
  latin: z.string().nullable().describe('Латинское название вида; null, если species = null'),
  confidence: z.number().min(0).max(1).describe('Уверенность в виде, 0..1; 0, если species = null'),
})

export type BirdAiResult = z.infer<typeof resultSchema> & {
  model: string
  inputTokens: number | null
  outputTokens: number | null
}

function buildPrompt(): string {
  const region = process.env.BIRDFEEDER_REGION || DEFAULT_REGION
  return [
    `Снимок с камеры у птичьей кормушки (${region}). Камера дешёвая: кадр мелкий,`,
    'бывает смазан, пересвечен или с цветовым шумом. Внизу слева — метка времени, её игнорируй.',
    'Снимок сделан по детектору движения, поэтому часто на нём нет птицы: ветки, тени,',
    'смена освещения, насекомые, кошки, люди. Такие случаи — bird=false.',
    '',
    'Определи вид только если уверен по видимым признакам (окраска, форма клюва, размер).',
    'Если птица есть, но вид не разобрать — species=null, confidence=0. Не угадывай.',
    `Чаще всего здесь бывают: ${REGION_SPECIES.join(', ')}.`,
    'Другие виды региона тоже возможны.',
  ].join('\n')
}

export async function classifyBirdPhoto(jpeg: ArrayBuffer): Promise<BirdAiResult> {
  const model = getBirdAiModel()
  const { output, usage } = await generateText({
    model,
    // Рассуждения оплачиваются как выходные токены и в разы удорожают запрос
    reasoning: 'none',
    maxOutputTokens: 300,
    abortSignal: AbortSignal.timeout(60_000),
    output: Output.object({ schema: resultSchema }),
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

  const species = output.bird ? output.species?.trim() || null : null
  return {
    bird: output.bird,
    count: output.bird ? Math.max(1, output.count) : 0,
    species,
    latin: species ? output.latin?.trim() || null : null,
    confidence: species ? output.confidence : 0,
    model,
    inputTokens: usage.inputTokens ?? null,
    outputTokens: usage.outputTokens ?? null,
  }
}
