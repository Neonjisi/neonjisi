'use client'

import { useState } from 'react'
import { Check, Copy, Share2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function InviteLinkCard({ inviteUrl }: { inviteUrl: string }) {
  const [copied, setCopied] = useState(false)

  async function copyLink() {
    await navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  async function shareLink() {
    if (navigator.share) {
      await navigator.share({ title: '넌지시 친구 초대', text: '내 취향을 넌지시 확인해보세요.', url: inviteUrl })
      return
    }
    await copyLink()
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-[16px] border border-neutral-200 bg-surface px-4 py-3">
        <p className="break-all text-sm text-neutral-700">{inviteUrl}</p>
      </div>
      <Button variant="secondary" onClick={copyLink} aria-live="polite">
        {copied ? <Check size={18} aria-hidden /> : <Copy size={18} aria-hidden />}
        {copied ? '복사했어요' : '복사'}
      </Button>
      <Button size="lg" onClick={shareLink}><Share2 size={19} aria-hidden />공유하기</Button>
    </div>
  )
}
