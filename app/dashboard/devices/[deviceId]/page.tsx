import { DeviceDetailPage } from '@/components/dashboard/device-detail-page'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ deviceId: string }>
}) {
  const { deviceId } = await params
  return {
    title: `${decodeURIComponent(deviceId)} — ESP32 Gateway`,
  }
}

export default function Page() {
  return <DeviceDetailPage />
}
