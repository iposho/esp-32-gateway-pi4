import { BirdLabeling } from '@/components/dashboard/bird-labeling'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Разметка снимков кормушки — ESP32 Gateway',
}

export default function BirdLabelsPage() {
  return <BirdLabeling />
}
