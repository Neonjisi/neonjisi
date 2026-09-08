import { FriendAvatar } from '@/components/friend/avatar'
import { FundingCard } from '@/components/funding/funding-card'
import { FriendTasteCard } from '@/components/friend/friend-taste-card'
import { RemoveFriendMenu } from '@/components/friend/remove-friend-dialog'
import { TopBar } from '@/components/ui/top-bar'
import { LinkButton } from '@/components/ui/button'
import { getFriendTaste } from '@/lib/dal/friend'
import { getFriendEvents } from '@/lib/dal/event'
import { getFriendFundings } from '@/lib/dal/funding'

export default async function FriendDetailPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params
  const [friend, events, fundings] = await Promise.all([
    getFriendTaste(userId),
    getFriendEvents(userId),
    getFriendFundings(userId),
  ])
  const returnTo = `/friends/${userId}`
  return (
    <>
      <TopBar title={friend.displayName} backHref="/friends" action={<RemoveFriendMenu friendUserId={friend.userId} friendDisplayName={friend.displayName} />} />
      <main className="flex-1">
        <header className="flex flex-col items-center px-5 pb-6 pt-4"><FriendAvatar name={friend.displayName} avatarUrl={friend.avatarUrl} size="lg" /><h1 className="pt-3 text-xl font-bold">{friend.displayName}</h1></header>
        <FriendTasteCard friend={friend} />
        <section className="px-5 pt-6"><h2 className="font-bold">다가오는 일정</h2>{events.length ? <ul className="mt-3 space-y-2">{events.slice(0, 3).map((event) => <li key={event.id} className="rounded-[20px] bg-surface p-4"><strong>{event.title}</strong><p className="mt-1 text-sm text-neutral-600">{event.nextDate.toISOString().slice(0, 10)}{event.isRecurring ? ' · 매년' : ''}</p></li>)}</ul> : <p className="mt-3 rounded-[20px] bg-surface p-4 text-sm text-neutral-600">등록된 일정이 없어요.</p>}</section>
        {/*
          FR-024 는 수령자의 활성 친구에게 상세 열람을 허용한다 — 그런데 목록이 없어 URL 을
          직접 받지 않으면 도달할 수 없었다(통합테스트 피드백). 그 친구를 보러 온 이 화면이
          "친구가 받는 펀딩" 의 도달 경로다. 없으면 섹션 자체를 그리지 않는다 — 빈 상태를
          매번 보여줄 만큼 흔한 일이 아니다.
        */}
        {fundings.length ? (
          <section className="px-5 pt-6">
            <h2 className="font-bold">진행 중인 펀딩</h2>
            <ul className="mt-3 space-y-3">
              {fundings.map((funding) => (
                <FundingCard key={funding.id} funding={funding} returnTo={returnTo} />
              ))}
            </ul>
          </section>
        ) : null}
        <div className="px-5 pb-8 pt-6">
          <LinkButton href={`/products/for/${friend.userId}?returnTo=${encodeURIComponent(`/friends/${friend.userId}`)}`} size="lg">
            이 취향에 맞는 선물 보기
          </LinkButton>
        </div>
      </main>
    </>
  )
}
