import { FriendAvatar } from '@/components/friend/avatar'
import { FriendTasteCard } from '@/components/friend/friend-taste-card'
import { RemoveFriendMenu } from '@/components/friend/remove-friend-dialog'
import { TopBar } from '@/components/ui/top-bar'
import { LinkButton } from '@/components/ui/button'
import { getFriendTaste } from '@/lib/dal/friend'
import { getFriendEvents } from '@/lib/dal/event'

export default async function FriendDetailPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params
  const [friend, events] = await Promise.all([getFriendTaste(userId), getFriendEvents(userId)])
  return (
    <>
      <TopBar title="친구 상세" backHref="/friends" action={<RemoveFriendMenu friendUserId={friend.userId} friendDisplayName={friend.displayName} />} />
      <main className="flex-1">
        <header className="flex flex-col items-center px-5 pb-6 pt-4"><FriendAvatar name={friend.displayName} avatarUrl={friend.avatarUrl} size="lg" /><h1 className="pt-3 text-xl font-bold">{friend.displayName}</h1></header>
        <FriendTasteCard friend={friend} />
        <section className="px-5 pt-6"><h2 className="font-bold">다가오는 일정</h2>{events.length ? <ul className="mt-3 space-y-2">{events.slice(0, 3).map((event) => <li key={event.id} className="rounded-[20px] bg-surface p-4"><strong>{event.title}</strong><p className="mt-1 text-sm text-neutral-600">{event.nextDate.toISOString().slice(0, 10)}{event.isRecurring ? ' · 매년' : ''}</p></li>)}</ul> : <p className="mt-3 rounded-[20px] bg-surface p-4 text-sm text-neutral-600">등록된 일정이 없어요.</p>}</section>
        <div className="px-5 pb-8 pt-6">
          <LinkButton href={`/products/for/${friend.userId}?returnTo=${encodeURIComponent(`/friends/${friend.userId}`)}`} size="lg">
            {friend.displayName}에게 선물 고르기
          </LinkButton>
        </div>
      </main>
    </>
  )
}
