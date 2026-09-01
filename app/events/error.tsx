'use client'

import { ErrorState } from '@/components/ui/error-state'

/** T019 — 일정 예외 경계 */
export default function EventsError({ retry }: { retry: () => void }) {
  return (
    <ErrorState
      title="일정을 불러오지 못했어요"
      description={'일시적인 문제일 수 있어요.\n잠시 후 다시 시도해주세요.'}
      onRetry={retry}
    />
  )
}
