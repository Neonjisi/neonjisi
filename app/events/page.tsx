import { EventManager } from '@/components/event/event-manager'
import { getMyEvents } from '@/lib/dal/event'

export default async function EventsPage() {
  const events = await getMyEvents()
  return <main className="min-h-dvh pb-8"><EventManager events={events} /></main>
}
