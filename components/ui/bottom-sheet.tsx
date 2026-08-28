"use client";

import type { ReactNode } from "react";
import { useModalFocus } from "@/components/ui/use-modal-focus";

type BottomSheetProps = {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  /** 시트 제목 요소의 id — aria-labelledby 연결용 */
  labelledBy?: string;
};

/**
 * 바텀 시트 프레젠테이션 컴포넌트.
 * 상태를 갖지 않으므로 여는 쪽(클라이언트 컴포넌트)이 open/close를 소유한다.
 * 포커스 이동·Escape·복귀는 열려 있는 동안만 마운트되는 안쪽 컴포넌트가 맡는다.
 */
export function BottomSheet({ isOpen, onClose, children, labelledBy }: BottomSheetProps) {
  if (!isOpen) return null;
  return (
    <OpenBottomSheet onClose={onClose} labelledBy={labelledBy}>
      {children}
    </OpenBottomSheet>
  );
}

function OpenBottomSheet({ onClose, children, labelledBy }: Omit<BottomSheetProps, "isOpen">) {
  const { containerRef, onKeyDown } = useModalFocus<HTMLDivElement>(onClose);
  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      className="fixed inset-0 z-50 flex justify-center outline-none"
    >
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="absolute inset-0 animate-[fade-in_150ms_ease-out] bg-scrim"
      />
      <div className="absolute bottom-0 w-full max-w-[430px] animate-[sheet-up_200ms_ease-out] rounded-t-3xl bg-surface px-5 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <div className="flex justify-center py-3" aria-hidden>
          <span className="h-1 w-9 rounded-full bg-neutral-200" />
        </div>
        {children}
      </div>
    </div>
  );
}
