"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { EllipsisVertical } from "lucide-react";
import { removeFriend } from "@/app/friends/actions/friendship";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { useModalFocus } from "@/components/ui/use-modal-focus";
import { REMOVE_FRIEND_FAILED_MESSAGE } from "@/lib/actions/call-action";
import { isRedirectError } from "@/lib/actions/redirect-error";

/**
 * 친구 해제 진입점 + 확인 다이얼로그 (SCR-M2-06 `(:)` 메뉴 → SCR-M2-07 · T052)
 *
 * 클라이언트 컴포넌트는 이 파일 하나다 (contracts §4 예산). 친구 상세 화면(Server Component)은
 * TopBar 의 action 자리에 <RemoveFriendMenu> 만 얹는다 — 목록·카드 렌더는 서버에 남긴다.
 *
 * 문구 규칙: M2 에서는 거래가 없어 "진행 중인 선물은 그대로 진행됩니다"가 거짓말이라 뺐다.
 * M3 에서 GiftRequest 가 생기며 참이 되어 추가했다 (M3 T050 · D3 "진행 중 거래 예외").
 */

type RemoveFriendMenuProps = {
  friendUserId: string;
  friendDisplayName: string;
};

/** 친구 상세 TopBar 의 `⋮` — 메뉴 시트를 열고, 거기서 해제 확인으로 이어진다 */
export function RemoveFriendMenu({ friendUserId, friendDisplayName }: RemoveFriendMenuProps) {
  const router = useRouter();
  const menuTitleId = useId();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isRemoving, startRemoving] = useTransition();

  const openConfirm = () => {
    setIsMenuOpen(false);
    setServerError(null);
    setIsConfirming(true);
  };

  const handleConfirm = () => {
    startRemoving(async () => {
      setServerError(null);
      const result = await callRemoveFriend(friendUserId);
      if (!result.ok) {
        // 예상 가능한 실패는 결과 값으로 온다 (FR-016 계열) — 다이얼로그를 유지하고 문구만 보인다
        setServerError(result.error.message);
        return;
      }
      // 해제된 상대의 상세는 더 이상 열리지 않는다 — 목록으로 돌아가고 서버 렌더를 새로 받는다
      setIsConfirming(false);
      router.replace("/friends");
      router.refresh();
    });
  };

  return (
    <>
      <button
        type="button"
        aria-label="더보기"
        aria-haspopup="dialog"
        aria-expanded={isMenuOpen}
        onClick={() => setIsMenuOpen(true)}
        className="grid size-10 place-items-center rounded-full text-neutral-900 active:bg-neutral-100"
      >
        <EllipsisVertical size={22} aria-hidden />
      </button>

      <BottomSheet isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} labelledBy={menuTitleId}>
        <h2 id={menuTitleId} className="pb-2 text-base font-bold text-neutral-900">
          친구 관리
        </h2>
        <button
          type="button"
          onClick={openConfirm}
          className="flex h-[52px] w-full items-center text-[15px] text-error-600 active:bg-neutral-50"
        >
          친구 해제
        </button>
      </BottomSheet>

      <RemoveFriendDialog
        isOpen={isConfirming}
        friendDisplayName={friendDisplayName}
        errorMessage={serverError}
        isRemoving={isRemoving}
        onConfirm={handleConfirm}
        onCancel={() => {
          if (isRemoving) return;
          setIsConfirming(false);
          setServerError(null);
        }}
      />
    </>
  );
}

/**
 * Server Action 호출 자체가 throw 하면(네트워크 단절 등) STORAGE_FAILED 결과로 바꾼다 —
 * M1 의 lib/actions/call-action.ts 와 같은 이유(FR-016)다. 그 헬퍼는 M1 의 ActionResult 타입에
 * 묶여 있어 M2 의 오류 코드(NOT_FRIENDS)를 받지 못하므로 여기서 같은 규칙만 되풀이한다.
 */
async function callRemoveFriend(friendUserId: string): Promise<Awaited<ReturnType<typeof removeFriend>>> {
  try {
    return await removeFriend({ friendUserId });
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error("[remove-friend-dialog] Server Action 호출 실패 — STORAGE_FAILED 로 변환", error);
    return { ok: false, error: { code: "STORAGE_FAILED", message: REMOVE_FRIEND_FAILED_MESSAGE } };
  }
}

type RemoveFriendDialogProps = {
  isOpen: boolean;
  friendDisplayName: string;
  errorMessage: string | null;
  isRemoving: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/** 해제 확인 다이얼로그 (SCR-M2-07) — 무엇이 닫히는지 고지하고 확인을 받는다 (FR-024) */
export function RemoveFriendDialog({ isOpen, ...rest }: RemoveFriendDialogProps) {
  if (!isOpen) return null;
  return <OpenRemoveFriendDialog {...rest} />;
}

/** 열려 있는 동안만 마운트된다 — 포커스 이동·Escape·복귀를 여기서 맡는다 (M1 delete-confirm-dialog 패턴) */
function OpenRemoveFriendDialog({
  friendDisplayName,
  errorMessage,
  isRemoving,
  onConfirm,
  onCancel,
}: Omit<RemoveFriendDialogProps, "isOpen">) {
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
          {friendDisplayName}님과 친구를 해제할까요?
        </h2>
        <ul id={descriptionId} className="list-disc pl-5 pt-2 text-sm text-neutral-600">
          <li>서로의 취향을 볼 수 없게 됩니다</li>
          <li>양쪽 친구 목록에서 서로 사라집니다</li>
          <li>진행 중인 선물은 그대로 진행됩니다</li>
        </ul>
        {errorMessage && (
          <p role="alert" className="pt-3 text-sm text-error-600">
            {errorMessage}
          </p>
        )}
        <div className="flex gap-2 pt-5">
          <Button variant="secondary" className="flex-1" onClick={onCancel} disabled={isRemoving}>
            취소
          </Button>
          <Button variant="destructive" className="flex-1" onClick={onConfirm} disabled={isRemoving}>
            해제
          </Button>
        </div>
      </div>
    </div>
  );
}
