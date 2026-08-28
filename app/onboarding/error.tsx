"use client";

import { ErrorState } from "@/components/ui/error-state";

/**
 * T022 — 온보딩 예외 경계.
 * 카테고리 로딩 실패 등이 여기로 온다 — 시드가 비어 온보딩이 막히는 상황(T013)은
 * 재시도로 해결되지 않으므로, 문구는 재시도와 문의 양쪽을 다 안내한다.
 */
export default function OnboardingError({ reset }: { reset: () => void }) {
  return (
    <ErrorState
      title="온보딩을 불러오지 못했어요"
      description={"일시적인 문제일 수 있어요.\n잠시 후 다시 시도해주세요."}
      onRetry={reset}
    />
  );
}
