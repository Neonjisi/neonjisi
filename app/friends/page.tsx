import Link from 'next/link'
import { Plus } from 'lucide-react'
import { FriendList } from '@/components/friend/friend-list'
import { BottomNav } from '@/components/ui/bottom-nav'
import { TopBar } from '@/components/ui/top-bar'
import { getFriends } from '@/lib/dal/friend'
import { getUpcomingEvents } from '@/lib/dal/event'

export default async function FriendsPage() {
  const [friends, upcomingEvents] = await Promise.all([getFriends(), getUpcomingEvents()])
  const friendEvents = upcomingEvents.filter((event) => !event.isMine).slice(0, 3)
  return (
    <>
      <TopBar title="친구" action={<Link href="/friends/invite" aria-label="친구 추가" className="grid size-10 place-items-center rounded-full text-rose-600 active:bg-rose-50"><Plus size={24} aria-hidden /></Link>} />
      <main className="flex flex-1 flex-col">
        <FriendList friends={friends} />
        <section className="px-5 pb-8 pt-7">
          <h2 className="font-bold">다가오는 친구 일정</h2>
          {friendEvents.length ? <ul className="mt-3 space-y-2">{friendEvents.map((event) => <li key={event.id} className="rounded-[20px] bg-surface p-4"><strong>{event.ownerDisplayName}님 · {event.title}</strong><p className="mt-1 text-sm text-neutral-600">{event.nextDate.toISOString().slice(0, 10)}</p></li>)}</ul> : <p className="mt-3 rounded-[20px] bg-surface p-4 text-sm text-neutral-600">다가오는 친구 일정이 없어요.</p>}
        </section>
      </main>
      <BottomNav active="friends" />
    </>
  )
}
