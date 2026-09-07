import Link from 'next/link'
import { ChevronRight, Users } from 'lucide-react'
import { FriendAvatar } from '@/components/friend/avatar'
import { LinkButton } from '@/components/ui/button'
import type { FriendListItem } from '@/lib/dal/friend'

export function FriendList({ friends }: { friends: FriendListItem[] }) {
  if (friends.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-8 pb-20 text-center">
        <span className="grid size-[72px] place-items-center rounded-full bg-rose-50 text-rose-500"><Users size={30} aria-hidden /></span>
        <h2 className="pt-4 text-lg font-bold">링크 하나면 시작돼요</h2>
        <p className="pt-2 text-sm text-neutral-600">친구에게 링크를 보내 서로의 취향을 나눠보세요.</p>
        <LinkButton href="/friends/invite" className="mt-6">친구에게 링크 보내기</LinkButton>
      </div>
    )
  }
  return (
    <section className="px-5 pt-5">
      <h2 className="pb-2 text-base font-bold">친구 {friends.length}명</h2>
      <ul className="overflow-hidden rounded-[20px] bg-surface px-3">
        {friends.map((friend, index) => (
          <li key={friend.userId} className={index ? 'border-t border-neutral-100' : ''}>
            <Link href={`/friends/${friend.userId}`} className="flex min-h-[76px] items-center gap-3 px-1 py-3">
              <FriendAvatar name={friend.displayName} avatarUrl={friend.avatarUrl} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{friend.displayName}</p>
                {friend.tags.length > 0 && <p className="truncate pt-1 text-sm text-neutral-600">{friend.tags.join(' · ')}</p>}
              </div>
              <ChevronRight size={20} className="shrink-0 text-neutral-400" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
