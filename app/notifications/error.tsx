'use client'
import { ErrorState } from '@/components/ui/error-state'
export default function NotificationsError({ reset }: { reset: () => void }) {
  return <ErrorState title="알림을 불러오지 못했어요" description={'일시적인 문제일 수 있어요.\n잠시 후 다시 시도해주세요.'} onRetry={reset} />
}
