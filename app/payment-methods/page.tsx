import Link from "next/link";
import { MethodDeleteButton } from "@/components/payment/method-delete-dialog";
import { buttonClasses } from "@/components/ui/button";
import { TopBar } from "@/components/ui/top-bar";
import { safeReturnTo } from "@/lib/navigation/return-to";
import {
  countActiveRequestsUsing,
  getMyPaymentMethods,
  type PaymentMethodView,
} from "@/lib/dal/payment-method";

/**
 * 결제수단 관리 (SCR-M3-07 · T033) — 게이트: `getMyPaymentMethods()` 안의 verifySession()
 *
 * PaymentMethod.status 세 값이 전부 화면 표현을 가진다 (도메인 모델 §5):
 *  - ACTIVE  → "사용 중"
 *  - EXPIRED → 붉은 라벨 + "다시 등록해주세요" (마이 탭 배지도 함께 점등)
 *  - DELETED → 목록에서 사라진다. 행은 남아 지난 내역의 카드 표시를 지킨다
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
}: {
  method: PaymentMethodView;
  activeRequestCount: number;
}) {
  const isExpired = method.status === "EXPIRED";
  return (
    <li className="rounded-[20px] bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold text-neutral-900">{cardLabel(method)}</p>
          <p className={`pt-1 text-xs ${isExpired ? "text-error-600" : "text-neutral-600"}`}>
            {isExpired ? "만료됨 · 다시 등록해주세요" : "사용 중"}
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
        등록된 결제수단으로 선물 요청이 승인되면 자동으로 결제됩니다. 카드 정보는 넌지시에
        저장되지 않습니다.
      </p>
    </main>
  );
}
