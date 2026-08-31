import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CircleAlert, CircleCheck } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { getGiftResultView, type GiftResultView } from "@/lib/dal/gift-outcome";

/**
 * 결제 결과 (SCR-M3-15 · T054) — 게이트: `getGiftResultView()` 안의 verifySession()
 *
 * 종착 상태 셋이 각각 화면을 가진다 (도메인 모델 §5): `paid` · `expired` · `cancelled`.
 * **아직 끝나지 않은 요청은 여기 오지 않는다** — 상세(SCR-M3-11/12)로 돌려보낸다.
 *
 * 문구 원칙 (분담표 §4-S②):
 *  - 만료는 **수령자를 탓하지 않는다.** 5분 TTL 은 시연 기준이고, 제품 쪽 책임이 더 크다
 *  - 결제 실패 취소는 수령자에게 닿는 유일한 고지다 (FR-032). 무엇이 끝났는지와
 *    **다음에 무엇을 할 수 있는지**("별도로 연락해보세요")를 함께 말한다
 *
 * 스냅샷만 렌더한다 (R5) — 관계가 해제돼도, 상품이 내려가도 이 화면은 열린다.
 * ⚠️ 최종 문안은 S 몫이다. 여기 있는 것은 명세를 만족하는 초안이다.
 */

export const dynamic = "force-dynamic";

function formatAmount(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}원`;
}

function formatPaidAt(paidAt: Date): string {
  // 서버에서 문자열로 만든다 — 클라이언트가 다시 포맷하면 타임존·hydration 이 어긋난다
  const parts = new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(paidAt);
  return parts;
}

function ProductCard({ view }: { view: GiftResultView }) {
  return (
    <div className="rounded-[20px] bg-surface p-4">
      <p className="text-[15px] font-semibold text-neutral-900">{view.productName}</p>
      <p className="pt-1 text-sm text-neutral-600">{formatAmount(view.amount)}</p>
      {/* FR-021 — 대안은 요청 금액 이하다. 차액이 청구되지 않았음을 명시한다 */}
      {view.isCountered && view.amount < view.requestedAmount && (
        <p className="pt-2 text-xs text-neutral-500">
          처음 요청한 {formatAmount(view.requestedAmount)}과의 차액{" "}
          {formatAmount(view.requestedAmount - view.amount)}은 청구되지 않았습니다.
        </p>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <span className="shrink-0 text-sm text-neutral-600">{label}</span>
      <span className="min-w-0 break-words text-right text-sm text-neutral-900">{value}</span>
    </div>
  );
}

function PaidView({ view }: { view: GiftResultView }) {
  const isGiver = view.role === "giver";
  return (
    <>
      <CircleCheck size={44} className="text-rose-500" aria-hidden />
      <h1 className="pt-4 text-xl font-bold text-neutral-900">
        {isGiver ? "결제가 완료됐어요" : "선물이 확정됐어요"}
      </h1>
      <p className="pt-2 text-sm text-neutral-600">
        {isGiver
          ? `${view.counterpartDisplayName}님에게 선물이 전달됩니다.`
          : `${view.counterpartDisplayName}님이 보낸 선물이에요.`}
      </p>

      <div className="w-full pt-6">
        <ProductCard view={view} />
        <div className="pt-4">
          <DetailRow label={isGiver ? "받는 분" : "보낸 분"} value={view.counterpartDisplayName} />
          {view.paidAt && <DetailRow label="결제 시각" value={formatPaidAt(view.paidAt)} />}
          {/* 결제수단은 giver 에게만 보인다 — 수령자가 알 필요도, 알아서도 안 되는 정보다 */}
          {view.paymentMethodLabel && (
            <DetailRow label="결제수단" value={view.paymentMethodLabel} />
          )}
        </div>
      </div>
    </>
  );
}

function ExpiredView({ view }: { view: GiftResultView }) {
  const isGiver = view.role === "giver";
  return (
    <>
      <CircleAlert size={44} className="text-neutral-400" aria-hidden />
      <h1 className="pt-4 text-xl font-bold text-neutral-900">응답 기한이 지났어요</h1>
      <p className="pt-2 text-sm leading-relaxed text-neutral-600">
        {isGiver
          ? `${view.counterpartDisplayName}님이 시간 안에 확인하지 못했습니다.`
          : "확인 시간이 지나 요청이 종료되었습니다."}
        <br />
        결제는 이루어지지 않았습니다.
      </p>
      <div className="w-full pt-6">
        <ProductCard view={view} />
      </div>
    </>
  );
}

function CancelledView({ view }: { view: GiftResultView }) {
  const isGiver = view.role === "giver";
  return (
    <>
      <CircleAlert size={44} className="text-error-500" aria-hidden />
      <h1 className="pt-4 text-xl font-bold text-neutral-900">선물이 취소되었어요</h1>
      <p className="pt-2 text-sm leading-relaxed text-neutral-600">
        결제가 완료되지 않아 요청이 취소되었습니다.
        <br />
        {/* S 확정 문구 — 끝난 사실만 알리고 끊지 않는다 */}
        {view.counterpartDisplayName}님께 별도로 연락해보세요.
      </p>
      <div className="w-full pt-6">
        <ProductCard view={view} />
      </div>
      {isGiver && (
        <p className="w-full pt-3 text-xs text-neutral-500">
          청구된 금액은 없습니다. 결제수단을 확인한 뒤 다시 보낼 수 있어요.
        </p>
      )}
    </>
  );
}

export default async function GiftResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const view = await getGiftResultView(id);

  // 당사자가 아니면 없는 것과 같다 — 존재 여부가 id 탐색의 힌트가 되지 않게
  if (view === null) notFound();

  // 아직 끝나지 않은 요청은 상세가 맡는다 (H 의 T042 롤 분기)
  if (view.variant === "IN_PROGRESS") redirect(`/gifts/${id}`);

  return (
    <main className="flex min-h-dvh flex-col items-center px-5 pb-8 pt-16 text-center">
      {view.variant === "PAID" && <PaidView view={view} />}
      {view.variant === "EXPIRED" && <ExpiredView view={view} />}
      {view.variant === "CANCELLED" && <CancelledView view={view} />}

      <div className="mt-auto flex w-full flex-col gap-2 pt-10">
        {/* 만료된 요청은 같은 상품으로 다시 보낼 수 있다 — 상품 상세(H 의 SCR-M3-04)로 간다 */}
        {view.variant === "EXPIRED" && view.role === "giver" && (
          <Link href={`/products/${view.productId}`} className={buttonClasses("primary", "lg")}>
            다시 보내기
          </Link>
        )}
        <Link
          href="/"
          className={buttonClasses(view.variant === "PAID" ? "primary" : "secondary", "lg")}
        >
          확인
        </Link>
      </div>
    </main>
  );
}
