import { CircleCheck, Link2Off } from 'lucide-react'
import { redirect } from 'next/navigation'
import { acceptInvite } from '@/app/friends/actions/accept-invite'
import { InvitePreview } from '@/components/friend/invite-preview'
import { LinkButton } from '@/components/ui/button'
import { getPreview } from '@/lib/dal/invite'
import { getOptionalSession } from '@/lib/dal/session'

function MessageScreen({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col items-center justify-center px-8 pb-16 text-center">
      <span className="grid size-[72px] place-items-center rounded-full bg-neutral-100"><Link2Off size={30} className="text-neutral-500" aria-hidden /></span>
      <h1 className="pt-5 text-xl font-bold">{title}</h1><p className="pt-2 text-sm leading-relaxed text-neutral-600">{description}</p>
      {action && <div className="w-full pt-7">{action}</div>}
    </main>
  )
}

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const [preview, session] = await Promise.all([getPreview(token), getOptionalSession()])
  if (!preview) return <MessageScreen title="더 이상 쓸 수 없는 링크예요" description="보낸 분께 새 링크를 요청해주세요." action={<LinkButton href="/" size="lg">넌지시 둘러보기</LinkButton>} />
  if (!session) return <InvitePreview preview={preview} token={token} />
  if (session.userId === preview.inviterUserId) return <MessageScreen title="내 링크예요" description="이 링크를 친구에게 보내주세요." action={<LinkButton href="/friends" size="lg">친구 목록으로</LinkButton>} />

  const result = await acceptInvite({ token })
  if (!result.ok) {
    if (result.error.code === 'ALREADY_FRIENDS') redirect(`/friends/${preview.inviterUserId}`)
    if (result.error.code === 'LINK_INVALID') return <MessageScreen title="더 이상 쓸 수 없는 링크예요" description="가입은 완료됐어요. 보낸 분께 새 링크를 요청해주세요." action={<LinkButton href="/friends" size="lg">친구 목록으로</LinkButton>} />
    return <MessageScreen title={result.error.message} description="링크를 다시 확인해주세요." action={<LinkButton href="/friends" size="lg">친구 목록으로</LinkButton>} />
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col items-center justify-center px-8 pb-16 text-center">
      <span className="grid size-[80px] place-items-center rounded-full bg-success-50"><CircleCheck size={38} className="text-success-500" aria-hidden /></span>
      <h1 className="pt-5 text-2xl font-bold">{preview.displayName}님과<br />친구가 되었어요</h1>
      <p className="pt-3 text-sm text-neutral-600">이제 서로의 취향을 볼 수 있어요.</p>
      <div className="w-full pt-8"><LinkButton href={`/friends/${result.data.friendUserId}`} size="lg">{preview.displayName}님 취향 보기</LinkButton><LinkButton href="/friends" variant="tertiary" className="mt-2">친구 목록으로</LinkButton></div>
    </main>
  )
}
