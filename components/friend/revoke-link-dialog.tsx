"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { revokeInviteLink } from "@/app/friends/actions/invite-link";
import { Button } from "@/components/ui/button";
import { useModalFocus } from "@/components/ui/use-modal-focus";
import { REVOKE_LINK_FAILED_MESSAGE } from "@/lib/actions/call-action";
import { isRedirectError } from "@/lib/actions/redirect-error";

/**
 * 초대 링크 중지 버튼 + 확인 다이얼로그 (SCR-M2-03 · T042·T045)
 *
 * ⚠️ **클라이언트 컴포넌트 예산(contracts §4)에 계획돼 있지 않던 넷째다.** 계획은 셋
 * (invite-link-card · remove-friend-dialog · notification-list)이었다. 중지는 되돌릴 수 없어
 * 확인을 받아야 하고(SCR-M2-03 "확인 다이얼로그"), 확인은 열림 상태를 필요로 한다 —
 * M1 의 delete-confirm-dialog · M2 의 remove-friend-dialog 와 같은 자리다.
 * **목록 렌더는 서버에 남는다** — 이 컴포넌트는 버튼 하나와 다이얼로그만 맡는다.
 * T057(`'use client'` 점검)에서 이 문단이 판단 근거다.
 *
 * 문구 규칙: **"이미 맺어진 친구 관계가 끊긴다"고 쓰지 않는다.** 중지는 관계를 되돌리지
 * 않는다 — 그건 해제(US4)의 몫이고, 여기서 그렇게 적으면 거짓말이 된다.
 */

type RevokeLinkButtonProps = {
  linkId: string;
};

export function RevokeLinkButton({ linkId }: RevokeLinkButtonProps) {
  const router = useRouter();
  const [isConfirming, setIsConfirming] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isRevoking, startRevoking] = useTransition();

  const handleConfirm = () => {
    startRevoking(async () => {
      setServerError(null);
      const result = await callRevokeInviteLink(linkId);
      if (!result.ok) {
        // 예상 가능한 실패는 결과 값으로 온다 (FR-016 계열) — 다이얼로그를 유지하고 문구만 보인다
        setServerError(result.error.message);
        return;
      }
      // 중지한 링크는 "사용 중"에서 "지난 링크"로 내려간다 — 서버 렌더를 새로 받는다
      setIsConfirming(false);
      router.refresh();
    });
  };

  return (
    <>
      <button
        type="button"
        aria-label="링크 중지"
        aria-haspopup="dialog"
        onClick={() => {
          setServerError(null);
          setIsConfirming(true);
        }}
        className="h-12 rounded-[14px] px-6 text-sm font-semibold text-neutral-600 active:bg-neutral-100"
      >
        중지
      </button>

      {isConfirming && (
        <RevokeLinkDialog
          errorMessage={serverError}
          isRevoking={isRevoking}
          onConfirm={handleConfirm}
          onCancel={() => {
            if (isRevoking) return;
            setIsConfirming(false);
            setServerError(null);
          }}
        />
      )}
    </>
  );
}

/**
 * Server Action 호출 자체가 throw 하면(네트워크 단절 등) STORAGE_FAILED 결과로 바꾼다 —
 * remove-friend-dialog.tsx 와 같은 이유(FR-016)다. lib/actions/call-action 의 헬퍼는 M1 의
 * ActionResult 타입에 묶여 있어 M2 의 오류 코드를 받지 못하므로 같은 규칙만 되풀이한다.
 */
async function callRevokeInviteLink(
  linkId: string,
): Promise<Awaited<ReturnType<typeof revokeInviteLink>>> {
  try {
    return await revokeInviteLink({ linkId });
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error("[revoke-link-dialog] Server Action 호출 실패 — STORAGE_FAILED 로 변환", error);
    return { ok: false, error: { code: "STORAGE_FAILED", message: REVOKE_LINK_FAILED_MESSAGE } };
  }
}

type RevokeLinkDialogProps = {
  errorMessage: string | null;
  isRevoking: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/** 열려 있는 동안만 마운트된다 — 포커스 이동·Escape·복귀를 여기서 맡는다 (remove-friend-dialog 패턴) */
function RevokeLinkDialog({
  errorMessage,
  isRevoking,
  onConfirm,
  onCancel,
}: RevokeLinkDialogProps) {
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
          이 링크를 중지할까요?
        </h2>
        <ul id={descriptionId} className="list-disc pl-5 pt-2 text-sm text-neutral-600">
          <li>이 링크로는 더 이상 친구가 될 수 없습니다</li>
          <li>이미 친구가 된 사이는 그대로 유지됩니다</li>
          <li>새 링크는 언제든 다시 발급할 수 있습니다</li>
        </ul>
        {errorMessage && (
          <p role="alert" className="pt-3 text-sm text-error-600">
            {errorMessage}
          </p>
        )}
        <div className="flex gap-2 pt-5">
          <Button variant="secondary" className="flex-1" onClick={onCancel} disabled={isRevoking}>
            취소
          </Button>
          <Button variant="destructive" className="flex-1" onClick={onConfirm} disabled={isRevoking}>
            중지
          </Button>
        </div>
      </div>
    </div>
  );
}
