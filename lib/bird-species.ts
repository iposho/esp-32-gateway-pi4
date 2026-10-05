/**
 * Виды птиц кормушки: единые названия для статистики.
 * Модель пишет вид свободным текстом («Большая синица», «синица большая»,
 * «Parus Major»), поэтому вид определяется латинским названием, а русское
 * берётся из списка. Без серверных зависимостей.
 */

type KnownSpecies = {
  ru: string
  latin: string
  /** Другие русские названия и устаревшие латинские, которые встречаются в ответах */
  aliases?: string[]
}

/** Частые гости кормушек в Армении — подсказка модели и словарь названий */
export const REGION_SPECIES: KnownSpecies[] = [
  { ru: 'Большая синица', latin: 'Parus major', aliases: ['Синица большая'] },
  { ru: 'Лазоревка', latin: 'Cyanistes caeruleus', aliases: ['Обыкновенная лазоревка', 'Parus caeruleus'] },
  { ru: 'Домовый воробей', latin: 'Passer domesticus', aliases: ['Воробей домовый'] },
  { ru: 'Полевой воробей', latin: 'Passer montanus', aliases: ['Воробей полевой'] },
  { ru: 'Черногрудый воробей', latin: 'Passer hispaniolensis', aliases: ['Испанский воробей'] },
  { ru: 'Зяблик', latin: 'Fringilla coelebs', aliases: ['Обыкновенный зяблик'] },
  { ru: 'Щегол', latin: 'Carduelis carduelis', aliases: ['Черноголовый щегол', 'Обыкновенный щегол'] },
  { ru: 'Зеленушка', latin: 'Chloris chloris', aliases: ['Обыкновенная зеленушка', 'Carduelis chloris'] },
  { ru: 'Канареечный вьюрок', latin: 'Serinus serinus', aliases: ['Европейский вьюрок'] },
  { ru: 'Чёрный дрозд', latin: 'Turdus merula', aliases: ['Дрозд чёрный'] },
  { ru: 'Зарянка', latin: 'Erithacus rubecula', aliases: ['Малиновка'] },
  { ru: 'Обыкновенный скворец', latin: 'Sturnus vulgaris', aliases: ['Скворец'] },
  { ru: 'Сирийский дятел', latin: 'Dendrocopos syriacus' },
  { ru: 'Кольчатая горлица', latin: 'Streptopelia decaocto', aliases: ['Горлица кольчатая'] },
  {
    ru: 'Малая горлица',
    latin: 'Spilopelia senegalensis',
    aliases: ['Горлица малая', 'Египетская горлица', 'Streptopelia senegalensis'],
  },
  { ru: 'Сизый голубь', latin: 'Columba livia', aliases: ['Голубь сизый'] },
  { ru: 'Сорока', latin: 'Pica pica', aliases: ['Обыкновенная сорока'] },
  { ru: 'Серая ворона', latin: 'Corvus cornix', aliases: ['Ворона серая'] },
  { ru: 'Галка', latin: 'Coloeus monedula', aliases: ['Corvus monedula'] },
]

/** Регистр, «ё», дефисы и лишние пробелы не различают названия */
function norm(s: string): string {
  return s.toLowerCase().replace(/ё/g, 'е').replace(/[\s_-]+/g, ' ').trim()
}

/** «parus MAJOR» → «Parus major»; подвид отбрасываем: вид важнее */
function canonicalLatin(s: string): string {
  const [genus, epithet] = s.trim().split(/\s+/)
  if (!epithet) return genus.charAt(0).toUpperCase() + genus.slice(1).toLowerCase()
  return `${genus.charAt(0).toUpperCase()}${genus.slice(1).toLowerCase()} ${epithet.toLowerCase()}`
}

function capitalize(s: string): string {
  const t = s.trim().replace(/\s+/g, ' ')
  return t.charAt(0).toUpperCase() + t.slice(1)
}

const byName = new Map<string, KnownSpecies>()
for (const s of REGION_SPECIES) {
  for (const name of [s.ru, s.latin, ...(s.aliases ?? [])]) byName.set(norm(name), s)
}

export type SpeciesName = {
  species: string | null
  latin: string | null
  /** Ключ для группировки: латинское название в нижнем регистре, иначе русское */
  key: string | null
}

/**
 * Единое название вида. Известный вид ищется по латыни, затем по русскому
 * названию; неизвестный остаётся как ответила модель, только с выровненным регистром.
 */
export function normalizeSpecies(species: string | null, latin: string | null): SpeciesName {
  const known =
    (latin ? byName.get(norm(canonicalLatin(latin))) : undefined) ??
    (species ? byName.get(norm(species)) : undefined)
  if (known) return { species: known.ru, latin: known.latin, key: norm(known.latin) }

  const lat = latin?.trim() ? canonicalLatin(latin) : null
  const ru = species?.trim() ? capitalize(species) : null
  if (!ru && !lat) return { species: null, latin: null, key: null }
  // Без русского названия показываем латинское: вид всё равно назван
  return { species: ru ?? lat, latin: lat, key: lat ? norm(lat) : `ru:${norm(ru!)}` }
}
