import { FriendAvatar } from '@/components/friend/avatar'
import { FriendTasteCard } from '@/components/friend/friend-taste-card'
import { RemoveFriendMenu } from '@/components/friend/remove-friend-dialog'
import { TopBar } from '@/components/ui/top-bar'
import { LinkButton } from '@/components/ui/button'
import { getFriendTaste } from '@/lib/dal/friend'

export default async function FriendDetailPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params
  const friend = await getFriendTaste(userId)
  return (
    <>
      <TopBar title={friend.displayName} backHref="/friends" action={<RemoveFriendMenu friendUserId={friend.userId} friendDisplayName={friend.displayName} />} />
      <main className="flex-1">
        <header className="flex flex-col items-center px-5 pb-6 pt-4"><FriendAvatar name={friend.displayName} avatarUrl={friend.avatarUrl} size="lg" /><h1 className="pt-3 text-xl font-bold">{friend.displayName}</h1></header>
        <FriendTasteCard friend={friend} />
        <div className="px-5 pb-8 pt-6">
          <LinkButton href={`/products/for/${friend.userId}?returnTo=${encodeURIComponent(`/friends/${friend.userId}`)}`} size="lg">
            이 취향에 맞는 선물 보기
          </LinkButton>
        </div>
      </main>
    </>
  )
}
