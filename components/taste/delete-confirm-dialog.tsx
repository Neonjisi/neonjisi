"use client";

import { useId } from "react";
import { Button } from "@/components/ui/button";

type DeleteConfirmDialogProps = {
  isOpen: boolean;
  itemLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
};

/** 삭제 확인 다이얼로그 (SCR-C-04 · T051) — hard delete라 되돌릴 수 없음을 고지한다 */
export function DeleteConfirmDialog({
  isOpen,
  itemLabel,
  onConfirm,
  onCancel,
}: DeleteConfirmDialogProps) {
  const titleId = useId();
  if (!isOpen) return null;
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-[60] flex items-center justify-center px-8"
    >
      <button
        type="button"
        aria-label="닫기"
        onClick={onCancel}
        className="absolute inset-0 animate-[fade-in_150ms_ease-out] bg-scrim"
      />
      <div className="relative w-full max-w-[320px] animate-[sheet-up_200ms_ease-out] rounded-[20px] bg-surface p-5">
        <h2 id={titleId} className="text-base font-bold text-neutral-900">
          &lsquo;{itemLabel}&rsquo;을(를) 삭제할까요?
        </h2>
        <p className="pt-1.5 text-sm text-neutral-600">삭제하면 되돌릴 수 없어요.</p>
        <div className="flex gap-2 pt-5">
          <Button variant="secondary" className="flex-1" onClick={onCancel}>
            취소
          </Button>
          <Button variant="destructive" className="flex-1" onClick={onConfirm}>
            삭제
          </Button>
        </div>
      </div>
    </div>
  );
}
