import { TrafficDashboard } from '@/components/traffic/traffic-dashboard'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'MQTT-трафик — ESP32 Gateway',
}

export default function TrafficPage() {
  return <TrafficDashboard />
}
