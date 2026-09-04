import { EventManager } from '@/components/event/event-manager'
import { TopBar } from '@/components/ui/top-bar'
import { getMyEvents } from '@/lib/dal/event'

export default async function EventsPage() {
  const events = await getMyEvents()
  return <main className="min-h-dvh pb-8"><TopBar title="일정" backHref="/" /><EventManager events={events} /></main>
}
