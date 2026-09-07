import { BillingKeyForm } from "@/components/payment/billing-key-form";
import { TopBar } from "@/components/ui/top-bar";
import { verifySession } from "@/lib/dal/session";
import { safeReturnTo } from "@/lib/navigation/return-to";

/**
 * 결제수단 등록 (SCR-M3-06 · T032) — 게이트: verifySession()
 *
 * **빌링키 등록이 요청보다 앞선다** (도메인 모델 §5). 요청 화면(SCR-M3-08)에 활성 수단이
 * 없으면 여기로 강제 진입시키고, 끝나면 `returnTo` 로 돌려보낸다 (FR-013 ②).
 * 그 경로는 주소를 만든 사람이 정한 값이라 safeReturnTo 로 정리한 뒤에야 폼으로 내려간다.
 *
 * 화면은 Server Component 다 — 클라이언트로 가는 것은 폼 하나뿐이다 (contracts §6).
 */

export default async function NewPaymentMethodPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  await verifySession();
  const { returnTo } = await searchParams;

  return (
    <main className="flex min-h-dvh flex-col">
      <TopBar title="결제수단 등록" backHref={safeReturnTo(returnTo)} />

      <div className="flex flex-col gap-6 px-5 pt-4">
        <div>
          <h2 className="text-xl font-bold leading-snug text-neutral-900">
            선물을 보내려면
            <br />
            결제수단이 필요해요.
          </h2>
          <p className="pt-2 text-sm text-neutral-600">
            한 번 등록하면 다음부터는 다시 입력하지 않습니다.
          </p>
        </div>

        <BillingKeyForm returnTo={safeReturnTo(returnTo)} />

        {/* FR-008 — 카드번호·CVC 는 앱을 지나지 않는다. 그 사실을 화면이 말한다 */}
        <p className="rounded-[14px] bg-neutral-50 p-4 text-xs leading-relaxed text-neutral-600">
          카드 정보는 넌지시에 저장되지 않습니다. 결제사가 보관합니다.
        </p>
      </div>
    </main>
  );
}
