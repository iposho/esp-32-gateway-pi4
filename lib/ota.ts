export const OTA_LABELS: Record<string, string> = {
  downloading: 'OTA: загрузка',
  writing: 'OTA: запись',
  success: 'OTA: готово',
  failed: 'OTA: ошибка',
}

export function getOtaStatus(payload: Record<string, unknown>) {
  const otaStatus = payload.ota as string | undefined
  const otaProgress =
    typeof payload.progress === 'number' ? payload.progress : 0
  const isOtaActive = Boolean(
    otaStatus && otaStatus !== 'failed' && otaStatus !== 'success',
  )
  const otaLabel = otaStatus
    ? (OTA_LABELS[otaStatus] ?? `OTA: ${otaStatus}`)
    : null

  return { otaStatus, otaProgress, isOtaActive, otaLabel }
}

export async function uploadDeviceFirmware(
  deviceId: string,
  file: File,
): Promise<void> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('deviceId', deviceId)

  const res = await fetch('/api/ota', {
    method: 'POST',
    body: formData,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(
      (err as { error?: string }).error ?? 'Ошибка загрузки прошивки',
    )
  }
}
