import { LandingPage } from '@/components/landing/landing-page'

export const metadata = {
  title: 'ESP32 Gateway — шлюз управления ESP32',
  description:
    'Self-hosted панель управления ESP32-устройствами через MQTT на Raspberry Pi',
}

export default function Page() {
  return <LandingPage />
}
