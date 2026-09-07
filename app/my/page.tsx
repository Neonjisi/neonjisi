import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { BottomNav } from "@/components/ui/bottom-nav";
import { FriendAvatar } from "@/components/friend/avatar";
import { signOut } from "@/app/my/actions";
import { getMyPaymentMethods } from "@/lib/dal/payment-method";
import { getMyProfileSummary } from "@/lib/dal/profile";
import { BrandLogo } from "@/components/ui/brand-logo";

/** 마이 탭 (SCR-M1-06). 내 취향 외 메뉴는 해당 마일스톤에서 연결한다. */

// M2 에서 "알림"과 "초대 링크 관리"가 실제 화면으로 연결됐다 (T045·T046). 알림 배지가 있는
// 홈(SCR-M3-01)은 M3 이라, 그때까지는 마이 탭이 두 화면의 유일한 진입점이다.
// M3 (T033): 결제수단이 실제 화면으로 연결됐다. 선물 내역은 H 의 T064 에서 연결한다.
const MAIN_MENU: { label: string; href: string }[] = [
  { label: "내 취향", href: "/taste" },
  { label: "알림", href: "/notifications" },
  { label: "선물 내역", href: "/my/gifts" },
  { label: "펀딩 내역", href: "/my/fundings" },
  { label: "결제수단", href: "/payment-methods" },
  { label: "초대 링크 관리", href: "/friends/invite/manage?from=my" },
];

// href 가 없는 항목은 **아직 문서가 없는 것**이다. 예전에는 href="#" 으로 두어 눌리는
// 링크처럼 보였지만 아무 일도 일어나지 않았다 — /settings 는 같은 항목을 "준비 중"으로
// 밝히고 있었으므로 그쪽에 맞춘다.
const SUB_MENU: { label: string; href?: string }[] = [
  { label: "알림 설정", href: "/settings" },
  { label: "약관 · 개인정보처리방침" },
];

function MenuCard({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-neutral-100 rounded-[20px] bg-surface px-4">{children}</div>;
}

function MenuRow({ label, href, badge }: { label: string; href?: string; badge?: string }) {
  // 갈 곳이 없는 항목은 링크로 만들지 않는다 — 눌리는 모양을 하고 아무 일도 안 하는 것보다
  // "준비 중"이라고 말해 두는 편이 정확하다 (/settings 와 같은 표기)
  if (!href) {
    return (
      <div className="flex h-[52px] items-center justify-between">
        <span className="text-[15px] text-neutral-500">{label}</span>
        <span className="text-xs text-neutral-400">준비 중</span>
      </div>
    );
  }
  return (
    <Link href={href} className="flex h-[52px] items-center justify-between active:bg-neutral-50">
      <span className="text-[15px] text-neutral-900">{label}</span>
      <span className="flex items-center gap-2">
        {/* 만료 배지 (SCR-M3-07) — 결제수단이 만료된 채로 요청을 만들면 결제에서 막힌다 */}
        {badge && (
          <span className="rounded-full bg-error-50 px-2 py-0.5 text-xs font-semibold text-error-600">
            {badge}
          </span>
        )}
        <ChevronRight size={20} className="text-neutral-400" aria-hidden />
      </span>
    </Link>
  );
}

export default async function MyPage() {
  // 만료 배지 점등 판정 (T033). 목록 자체는 /payment-methods 가 보여준다
  const [paymentMethods, profile] = await Promise.all([
    getMyPaymentMethods(),
    getMyProfileSummary(),
  ]);
  const hasExpiredMethod = paymentMethods.some((method) => method.status === "EXPIRED");

  return (
    <>
      <main className="flex-1 pb-6">
        <div className="px-3 pt-2">
          <BrandLogo href="/" />
        </div>
        <header className="flex items-center gap-3 px-5 pb-4 pt-6">
          <FriendAvatar name={profile.displayName} avatarUrl={profile.avatarUrl} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-bold text-neutral-900">{profile.displayName}</p>
            <p className="text-xs text-neutral-600">
              취향 {profile.tasteCount}개 · 친구 {profile.friendCount}명
            </p>
          </div>
          <Link
            href="/signup/profile?returnTo=%2Fmy"
            className="shrink-0 rounded-full border border-rose-200 bg-rose-50 px-4 py-1.5 text-sm font-semibold text-rose-700 active:bg-rose-100"
          >
            편집
          </Link>
        </header>
        <div className="flex flex-col gap-4 px-5">
          <MenuCard>
            {MAIN_MENU.map((item) => (
              <MenuRow
                key={item.label}
                {...item}
                badge={item.label === "결제수단" && hasExpiredMethod ? "만료됨" : undefined}
              />
            ))}
          </MenuCard>
          <MenuCard>
            {SUB_MENU.map((item) => (
              <MenuRow key={item.label} {...item} />
            ))}
            {/* Server Action 으로 실제 세션을 끊는다 — 예전에는 핸들러 없는 버튼이라
                눌러도 아무 일이 없었다 (app/my/actions.ts) */}
            <form action={signOut}>
              <button
                type="submit"
                className="flex h-[52px] w-full items-center text-[15px] text-error-600 active:bg-neutral-50"
              >
                로그아웃
              </button>
            </form>
          </MenuCard>
        </div>
      </main>
      <BottomNav active="my" />
    </>
  );
}
