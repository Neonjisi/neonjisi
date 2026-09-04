import Link from 'next/link'
import { Plus } from 'lucide-react'
import { FriendList } from '@/components/friend/friend-list'
import { BottomNav } from '@/components/ui/bottom-nav'
import { TopBar } from '@/components/ui/top-bar'
import { getFriends } from '@/lib/dal/friend'

export default async function FriendsPage() {
  const friends = await getFriends()
  return (
    <>
      <TopBar title="친구" action={<Link href="/friends/invite" aria-label="친구 추가" className="grid size-10 place-items-center rounded-full text-rose-600 active:bg-rose-50"><Plus size={24} aria-hidden /></Link>} />
      <main className="flex flex-1 flex-col"><FriendList friends={friends} /></main>
      <BottomNav active="friends" />
    </>
  )
}
