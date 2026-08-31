"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deletePaymentMethod } from "@/app/payment-methods/actions";
import { Button } from "@/components/ui/button";
import { useModalFocus } from "@/components/ui/use-modal-focus";
import { isRedirectError } from "@/lib/actions/redirect-error";

/**
 * 결제수단 삭제 진입점 + 확인 다이얼로그 (SCR-M3-07 · T033)
 * 클라이언트 컴포넌트 예산 6개 중 하나 (contracts §6). M2 remove-friend-dialog 패턴 그대로다.
 *
 * **진행 중 요청이 있어도 삭제를 막지 않는다** (FR-011). 막으면 사용자는 카드를 잃어버린
 * 상태에서도 수단을 정리할 수 없다. 대신 **몇 건이 영향을 받는지 숫자로 고지**하고,
 * 그 뒤의 결제 시도가 실패 경로(SCR-M3-16)로 흐른다는 사실까지 말한다.
 */

const DELETE_FAILED_MESSAGE = "결제수단을 삭제하지 못했어요. 잠시 후 다시 시도해주세요.";

type MethodDeleteButtonProps = {
  paymentMethodId: string;
  /** '신한 **** 4821' — 어떤 카드를 지우는지 다이얼로그가 그대로 보여준다 */
  cardLabel: string;
  /** 이 수단을 쓰는 진행 중 요청 수 (FR-011). 서버에서 세어 내려온다 */
  activeRequestCount: number;
};

export function MethodDeleteButton({
  paymentMethodId,
  cardLabel,
  activeRequestCount,
}: MethodDeleteButtonProps) {
  const router = useRouter();
  const [isConfirming, setIsConfirming] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isDeleting, startDeleting] = useTransition();

  const handleConfirm = () => {
    startDeleting(async () => {
      setServerError(null);
      const result = await callDelete(paymentMethodId);
      if (!result.ok) {
        setServerError(result.error.message);
        return;
      }
      setIsConfirming(false);
      // 목록과 마이 탭 배지가 함께 바뀐다 — 서버 렌더를 새로 받는다
      router.refresh();
    });
  };

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={isConfirming}
        onClick={() => {
          setServerError(null);
          setIsConfirming(true);
        }}
        className="shrink-0 rounded-full border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-600 active:bg-neutral-100"
      >
        삭제
      </button>

      {isConfirming && (
        <OpenMethodDeleteDialog
          cardLabel={cardLabel}
          activeRequestCount={activeRequestCount}
          errorMessage={serverError}
          isDeleting={isDeleting}
          onConfirm={handleConfirm}
          onCancel={() => {
            if (isDeleting) return;
            setIsConfirming(false);
            setServerError(null);
          }}
        />
      )}
    </>
  );
}

/** Server Action 호출 자체가 throw 하면 STORAGE_FAILED 결과로 바꾼다 (M2 와 같은 규칙) */
async function callDelete(
  paymentMethodId: string,
): Promise<Awaited<ReturnType<typeof deletePaymentMethod>>> {
  try {
    return await deletePaymentMethod({ paymentMethodId });
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error("[method-delete-dialog] Server Action 호출 실패 — STORAGE_FAILED 로 변환", error);
    return { ok: false, error: { code: "STORAGE_FAILED", message: DELETE_FAILED_MESSAGE } };
  }
}

type OpenMethodDeleteDialogProps = {
  cardLabel: string;
  activeRequestCount: number;
  errorMessage: string | null;
  isDeleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/** 열려 있는 동안만 마운트된다 — 포커스 이동·Escape·복귀를 여기서 맡는다 (M1·M2 다이얼로그 패턴) */
function OpenMethodDeleteDialog({
  cardLabel,
  activeRequestCount,
  errorMessage,
  isDeleting,
  onConfirm,
  onCancel,
}: OpenMethodDeleteDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const { containerRef, onKeyDown } = useModalFocus<HTMLDivElement>(onCancel);

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className="fixed inset-0 z-[60] flex items-center justify-center px-8 outline-none"
    >
      <button
        type="button"
        aria-label="닫기"
        onClick={onCancel}
        className="absolute inset-0 animate-[fade-in_150ms_ease-out] bg-scrim"
      />
      <div className="relative w-full max-w-[320px] animate-[sheet-up_200ms_ease-out] rounded-[20px] bg-surface p-5">
        <h2 id={titleId} className="text-base font-bold text-neutral-900">
          이 결제수단을 삭제할까요?
        </h2>
        <div id={descriptionId} className="pt-2 text-sm text-neutral-600">
          <p className="font-semibold text-neutral-900">{cardLabel}</p>
          {activeRequestCount > 0 && (
            <p className="pt-2 text-error-700">
              진행 중인 선물 요청 {activeRequestCount}건이 이 카드를 사용합니다. 삭제해도 요청은
              그대로 진행되지만, 결제 시점에 실패할 수 있습니다.
            </p>
          )}
          <p className="pt-2">지난 선물 내역에는 이 카드 표시가 그대로 남습니다.</p>
        </div>
        {errorMessage && (
          <p role="alert" className="pt-3 text-sm text-error-600">
            {errorMessage}
          </p>
        )}
        <div className="flex gap-2 pt-5">
          <Button variant="secondary" className="flex-1" onClick={onCancel} disabled={isDeleting}>
            취소
          </Button>
          <Button variant="destructive" className="flex-1" onClick={onConfirm} disabled={isDeleting}>
            삭제
          </Button>
        </div>
      </div>
    </div>
  );
}
