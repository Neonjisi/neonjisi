import Link from "next/link";
import { MethodDeleteButton } from "@/components/payment/method-delete-dialog";
import { buttonClasses } from "@/components/ui/button";
import { TopBar } from "@/components/ui/top-bar";
import { safeReturnTo } from "@/lib/navigation/return-to";
import {
  countActiveRequestsUsing,
  getActivePaymentMethod,
  getMyPaymentMethods,
  type PaymentMethodView,
} from "@/lib/dal/payment-method";

/**
 * 결제수단 관리 (SCR-M3-07 · T033) — 게이트: `getMyPaymentMethods()` 안의 verifySession()
 *
 * PaymentMethod.status 세 값이 전부 화면 표현을 가진다 (도메인 모델 §5):
 *  - ACTIVE  → 실제로 청구되는 한 장은 "기본 · 이 카드로 결제됩니다", 나머지는 "등록됨"
 *  - EXPIRED → 붉은 라벨 + "다시 등록해주세요" (마이 탭 배지도 함께 점등)
 *  - DELETED → 목록에서 사라진다. 행은 남아 지난 내역의 카드 표시를 지킨다
 *
 * ⚠️ ACTIVE 를 전부 "사용 중"으로 적으면 안 된다. 청구는 `getActivePaymentMethod()` 가 고르는
 *    **한 장**만 쓴다(가장 최근 등록). 두 장 다 "사용 중"이면 실패 카드가 최신일 때 사용자는
 *    이유를 모른 채 결제 실패만 겪는다. 어느 장이 청구되는지는 그 함수에 물어 맞춘다 —
 *    목록 정렬에 기대면 두 곳의 규칙이 갈라진다.
 *    (사용자가 직접 고르게 하려면 기본 수단 필드가 필요하다 — 스키마는 J 소유라 별건이다.)
 *
 * 목록 렌더는 Server Component 다 — 클라이언트로 가는 것은 삭제 다이얼로그 하나뿐이다.
 * 빌링키는 View 타입에 아예 없어 여기로 올 수 없다 (contracts §3).
 */

export const dynamic = "force-dynamic";

function cardLabel(method: PaymentMethodView): string {
  return `${method.cardBrand} **** ${method.cardLast4}`;
}

function MethodCard({
  method,
  activeRequestCount,
  isCharged,
}: {
  method: PaymentMethodView;
  activeRequestCount: number;
  /** 이 카드가 실제로 청구되는 한 장인지 (getActivePaymentMethod 기준) */
  isCharged: boolean;
}) {
  const isExpired = method.status === "EXPIRED";
  const statusLabel = isExpired
    ? "만료됨 · 다시 등록해주세요"
    : isCharged
      ? "기본 · 이 카드로 결제됩니다"
      : "등록됨 · 결제에는 쓰이지 않아요";
  return (
    <li className="rounded-[20px] bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold text-neutral-900">{cardLabel(method)}</p>
          <p
            className={`pt-1 text-xs ${
              isExpired ? "text-error-600" : isCharged ? "text-rose-600" : "text-neutral-600"
            }`}
          >
            {statusLabel}
          </p>
        </div>
        <MethodDeleteButton
          paymentMethodId={method.id}
          cardLabel={cardLabel(method)}
          activeRequestCount={activeRequestCount}
        />
      </div>
    </li>
  );
}

export default async function PaymentMethodsPage({ searchParams }: PageProps<"/payment-methods">) {
  const query = await searchParams;
  const rawReturnTo = typeof query.returnTo === "string" ? query.returnTo : query.returnTo?.[0];
  const returnTo = safeReturnTo(rawReturnTo, "/my");
  const methods = await getMyPaymentMethods();
  // 카드 수는 보통 한둘이다 (빌링키는 사용자당 재사용) — 건수 조회를 나란히 돌린다
  const activeRequestCounts = await Promise.all(
    methods.map((method) => countActiveRequestsUsing(method.id)),
  );
  // 결제가 실제로 집는 한 장 — 표시를 결제 경로와 같은 함수에 맞춘다
  const chargedMethod = await getActivePaymentMethod();

  return (
    <main className="flex min-h-dvh flex-col pb-8">
      <TopBar title="결제수단" backHref={returnTo} />

      {methods.length === 0 ? (
        <div className="px-5 pt-6">
          <p className="text-[15px] text-neutral-900">선물을 보내려면 결제수단이 필요해요</p>
          <p className="pt-1 text-sm text-neutral-600">
            카드를 등록해두면 요청이 승인될 때 자동으로 결제됩니다.
          </p>
        </div>
      ) : (
        <ul aria-label="등록된 결제수단" className="flex flex-col gap-3 px-5 pt-4">
          {methods.map((method, index) => (
            <MethodCard
              key={method.id}
              method={method}
              activeRequestCount={activeRequestCounts[index]}
              isCharged={method.id === chargedMethod?.id}
            />
          ))}
        </ul>
      )}

      <div className="px-5 pt-5">
        <Link href={`/payment-methods/new?returnTo=${encodeURIComponent(returnTo)}`} className={buttonClasses("secondary", "lg")}>
          {methods.length === 0 ? "결제수단 등록" : "+ 다른 결제수단 등록"}
        </Link>
      </div>

      <p className="px-5 pt-6 text-xs leading-relaxed text-neutral-600">
        선물 요청이 승인되면 <b className="font-semibold">기본</b> 결제수단으로 자동 결제됩니다.
        가장 최근에 등록한 카드가 기본이 됩니다. 카드 정보는 넌지시에 저장되지 않습니다.
      </p>
    </main>
  );
}
