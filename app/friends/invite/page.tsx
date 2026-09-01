import Link from 'next/link'
import { Info } from 'lucide-react'
import { InviteLinkCard } from '@/components/friend/invite-link-card'
import { TopBar } from '@/components/ui/top-bar'
import { getOrCreateActiveInviteLink } from '@/lib/dal/invite'

export default async function FriendInvitePage() {
  const link = await getOrCreateActiveInviteLink()
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ?? 'http://localhost:3000'
  const inviteUrl = `${siteUrl}/i/${link.token}`
  const expiresLabel = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric' }).format(link.expiresAt)
  return (
    <>
      <TopBar title="친구 추가" backHref="/friends" />
      <main className="flex flex-1 flex-col px-5 pb-10 pt-5">
        <h1 className="text-2xl font-bold leading-snug">링크를 보내면<br />받은 사람이 바로 친구가 됩니다.</h1>
        <div className="mt-4 flex gap-2 rounded-[16px] bg-warning-50 p-3 text-sm text-warning-700"><Info size={18} className="mt-0.5 shrink-0" aria-hidden /><p>별도의 승인 단계가 없어요. 내가 아는 사람에게만 링크를 보내주세요.</p></div>
        <div className="pt-8"><InviteLinkCard inviteUrl={inviteUrl} /></div>
        <div className="pt-5 text-center text-sm text-neutral-600"><p>{expiresLabel} 만료</p><p className="pt-1">여러 명에게 보낼 수 있어요</p></div>
        <Link href="/friends/invite/manage" className="mt-auto pt-8 text-center text-sm font-semibold text-neutral-600">링크 관리</Link>
      </main>
    </>
  )
}
