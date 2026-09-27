/**
 * Высота солнца над горизонтом, градусы (формулы NOAA, точность ~0,5°).
 * Хватает, чтобы отличить день от ночи у кормушки без внешних API.
 */
export function sunElevation(date: Date, latDeg: number, lonDeg: number): number {
  const rad = Math.PI / 180
  const start = Date.UTC(date.getUTCFullYear(), 0, 1)
  const dayOfYear = Math.floor((date.getTime() - start) / 86_400_000) + 1
  const hours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600

  // Дробный год, уравнение времени (мин) и склонение солнца (рад)
  const g = ((2 * Math.PI) / 365) * (dayOfYear - 1 + (hours - 12) / 24)
  const eqTime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(g) -
      0.032077 * Math.sin(g) -
      0.014615 * Math.cos(2 * g) -
      0.040849 * Math.sin(2 * g))
  const decl =
    0.006918 -
    0.399912 * Math.cos(g) +
    0.070257 * Math.sin(g) -
    0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g) -
    0.002697 * Math.cos(3 * g) +
    0.00148 * Math.sin(3 * g)

  const trueSolarMin = hours * 60 + eqTime + 4 * lonDeg
  const hourAngle = (trueSolarMin / 4 - 180) * rad
  const lat = latDeg * rad
  const cosZenith =
    Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(hourAngle)
  return 90 - Math.acos(Math.min(1, Math.max(-1, cosZenith))) / rad
}
