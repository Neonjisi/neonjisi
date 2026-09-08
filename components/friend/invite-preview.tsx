import { Gift, LockKeyhole } from 'lucide-react'
import { FriendAvatar } from '@/components/friend/avatar'
import { LinkButton } from '@/components/ui/button'
import { BottomNav } from '@/components/ui/bottom-nav'
import { TopBar } from '@/components/ui/top-bar'
import type { PreviewView } from '@/lib/dal/invite'

export function InvitePreview({ preview, token }: { preview: PreviewView; token: string }) {
  return (
    <>
    <TopBar title="초대 미리보기" backHref="/" showNotifications={false} />
    <main className="mx-auto flex w-full max-w-[430px] flex-1 flex-col px-5 pb-10 pt-6 text-center">
      <div className="flex flex-col items-center">
        <FriendAvatar name={preview.displayName} avatarUrl={preview.avatarUrl} size="lg" />
        <h1 className="pt-4 text-2xl font-bold">{preview.displayName}</h1>
        {preview.tags.length > 0 && <p className="pt-2 text-sm font-semibold text-rose-600">{preview.tags.join(' · ')}</p>}
      </div>
      <section className="mt-9 rounded-[24px] bg-surface p-5 text-left">
        <div className="flex items-center gap-2 text-neutral-900"><Gift size={20} className="text-rose-500" aria-hidden /><p className="font-semibold">{preview.displayName}님이 받고 싶은 선물을 넌지시 남겨두었어요.</p></div>
        <div className="mt-5 border-t border-neutral-100 pt-5">
          <p className="flex items-center gap-2 text-sm font-bold"><LockKeyhole size={17} aria-hidden />친구가 되면 볼 수 있어요</p>
          <ul className="list-disc space-y-1 pl-5 pt-3 text-sm text-neutral-600">
            <li>원하는 것</li><li>이미 있는 것 / 관심 없는 것</li><li>취향 서술</li>
          </ul>
        </div>
      </section>
      <div className="mt-auto pt-8"><LinkButton href={`/login?next=${encodeURIComponent(`/i/${token}`)}`} size="lg">넌지시 시작하기</LinkButton></div>
    </main>
    <BottomNav active="friends" />
    </>
  )
}
