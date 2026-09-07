import Link from "next/link";
import { redirect } from "next/navigation";
import { CircleAlert } from "lucide-react";
import { retryGiftPaymentFromForm } from "@/app/gifts/actions/payment";
import { buttonClasses } from "@/components/ui/button";
import { TopBar } from "@/components/ui/top-bar";
import { getGiftRecoveryView, type GiftRecoveryView } from "@/lib/dal/gift-outcome";
import type { RetryBlockedReason } from "@/lib/gift/outcome";

/**
 * 결제 실패 복구 (SCR-M3-16 · T055) — 게이트: `getGiftRecoveryView()` 안의 verifySession()
 *
 * 🔒 **giver 전용이다.** 수령자에게는 실패 진행 상황을 노출하지 않는다 (FR-030) —
 * 주는 사람의 결제 실패는 사적인 정보이고, 수령자는 최종 취소 시점에만 고지받는다.
 * 수령자가 이 주소를 열면 결과 화면으로 보낸다.
 *
 * 클라이언트 컴포넌트를 쓰지 않는다 (contracts §6 예산에 이 화면 몫이 없다) — 재시도는
 * 평범한 <form> + Server Action 이고, 수단 선택은 네이티브 <select> 다.
 *
 * 재시도 가능 판정은 lib/gift/outcome.ts 를 Action 과 **함께** 본다 — 화면이 버튼을
 * 보여줬는데 액션이 거절하면 사용자는 누르고 나서야 안 된다는 걸 안다.
 */

export const dynamic = "force-dynamic";

const BLOCKED_MESSAGE: Record<RetryBlockedReason, string> = {
  NOT_FAILED: "지금은 다시 시도할 수 없는 상태예요.",
  ATTEMPTS_EXHAUSTED: "재시도 횟수를 모두 사용해 요청이 취소되었어요.",
  WINDOW_EXPIRED: "재시도 기한이 지나 더 이상 시도할 수 없어요.",
};

const ERROR_MESSAGE: Record<string, string> = {
  NOT_OWNER: "이 선물의 결제를 다시 시도할 수 없어요.",
  NOT_RETRYABLE: "지금은 다시 시도할 수 없는 상태예요.",
  RETRY_EXPIRED: "재시도 기한이 지나 취소되었어요.",
  STORAGE_FAILED: "결제를 다시 시도하지 못했어요. 잠시 후 다시 시도해주세요.",
};

function formatAmount(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}원`;
}

function formatDeadline(retryUntil: Date): string {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(retryUntil);
}

/** 재시도 버튼 묶음 — 같은 카드 / 다른 카드 / 새 카드 등록 세 갈래 (SCR-M3-16) */
function RetryForms({ view }: { view: GiftRecoveryView }) {
  return (
    <div className="flex flex-col gap-3 pt-8">
      {view.otherActiveMethods.length > 0 && (
        <form action={retryGiftPaymentFromForm} className="flex flex-col gap-2">
          <input type="hidden" name="giftRequestId" value={view.giftRequestId} />
          <label htmlFor="paymentMethodId" className="text-xs font-semibold text-neutral-600">
            다른 결제수단으로 재시도
          </label>
          <select
            id="paymentMethodId"
            name="paymentMethodId"
            className="h-12 w-full rounded-xl border border-neutral-200 bg-surface px-3.5 text-sm text-neutral-900"
          >
            {view.otherActiveMethods.map((method) => (
              <option key={method.id} value={method.id}>
                {method.label}
              </option>
            ))}
          </select>
          <button type="submit" className={buttonClasses("primary", "lg")}>
            이 카드로 재시도
          </button>
        </form>
      )}

      <form action={retryGiftPaymentFromForm}>
        <input type="hidden" name="giftRequestId" value={view.giftRequestId} />
        <button
          type="submit"
          className={buttonClasses(
            view.otherActiveMethods.length > 0 ? "secondary" : "primary",
            "lg",
          )}
        >
          같은 카드로 재시도
        </button>
      </form>

      {/* 강제 진입 후 복귀 — 등록이 끝나면 이 화면으로 돌아온다 (safeReturnTo 가 검사한다) */}
      <Link
        href={`/payment-methods/new?returnTo=/gifts/${view.giftRequestId}/recover`}
        className={buttonClasses("tertiary", "lg")}
      >
        새 결제수단 등록하기
      </Link>
    </div>
  );
}

export default async function GiftRecoverPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ failed?: string; error?: string }>;
}) {
  const { id } = await params;
  const { failed, error } = await searchParams;
  const view = await getGiftRecoveryView(id);

  // giver 가 아니면(수령자 포함) 결과 화면으로 — 실패 진행은 보여주지 않는다 (FR-030).
  // 남의 요청이면 결과 화면이 다시 404 로 막는다
  if (view === null) redirect(`/gifts/${id}/result`);

  const alert = failed === "1" ? "다시 시도했지만 결제가 되지 않았어요." : ERROR_MESSAGE[error ?? ""];

  return (
    <main className="flex min-h-dvh flex-col pb-8">
      <TopBar title="결제 실패" backHref={`/gifts/${id}`} />

      <div className="flex flex-col items-center px-5 pt-6 text-center">
        <CircleAlert size={44} className="text-error-500" aria-hidden />
        <h1 className="pt-4 text-xl font-bold text-neutral-900">결제가 되지 않았어요</h1>
        <p className="pt-2 text-sm text-neutral-600">
          {view.receiverDisplayName}님은 이미 승인했어요. 결제만 마치면 선물이 전달됩니다.
        </p>
      </div>

      <div className="px-5 pt-6">
        <div className="rounded-[20px] bg-surface p-4">
          <p className="text-[15px] font-semibold text-neutral-900">{view.productName}</p>
          <p className="pt-1 text-sm text-neutral-600">{formatAmount(view.amount)}</p>
          {view.currentMethodLabel && (
            <p className="pt-2 text-xs text-neutral-500">{view.currentMethodLabel}</p>
          )}
        </div>

        {alert && (
          <p role="alert" className="pt-4 text-sm text-error-600">
            {alert}
          </p>
        )}

        <div className="pt-5 text-sm text-neutral-700">
          <p>
            시도 {view.attemptCount} / {view.maxAttempts}
          </p>
          {view.retryUntil && (
            <p className="pt-1">{formatDeadline(view.retryUntil)}까지 재시도할 수 있어요.</p>
          )}
        </div>

        {view.availability.canRetry ? (
          <RetryForms view={view} />
        ) : (
          // 기한·횟수가 끝나면 버튼을 두지 않는다 (SCR-M3-16 상태표) — 누를 수 없는 버튼은
          // "다시 눌러보면 될지도"라는 기대만 남긴다
          <div className="pt-8">
            <p className="text-sm text-neutral-600">
              {BLOCKED_MESSAGE[view.availability.reason]}
            </p>
            <Link href="/" className={`${buttonClasses("secondary", "lg")} mt-4`}>
              확인
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
