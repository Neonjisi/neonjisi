import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { BottomNav } from "@/components/ui/bottom-nav";
import { FriendAvatar } from "@/components/friend/avatar";
import { signOut } from "@/app/my/actions";
import { getMyPaymentMethods } from "@/lib/dal/payment-method";
import { getMyProfileSummary } from "@/lib/dal/profile";
import { TopBar } from "@/components/ui/top-bar";

const MENU_SECTIONS = [
  {
    title: "내 정보",
    items: [
      { label: "내 취향", href: "/taste" },
      { label: "결제수단", href: "/payment-methods" },
      { label: "초대 링크 관리", href: "/friends/invite/manage?from=my" },
    ],
  },
  {
    title: "선물 관리",
    items: [
      { label: "선물 내역", href: "/my/gifts" },
      { label: "펀딩 내역", href: "/my/fundings" },
    ],
  },
  {
    title: "설정",
    items: [{ label: "약관 · 개인정보처리방침", href: "/settings" }],
  },
] as const;

function MenuCard({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-neutral-100 rounded-[20px] bg-surface px-4">{children}</div>;
}

function MenuRow({ label, href, badge }: { label: string; href: string; badge?: string }) {
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
        <TopBar title="마이" />
        <header className="flex items-center gap-3 px-5 pb-4 pt-6">
          <FriendAvatar name={profile.displayName} avatarUrl={profile.avatarUrl} size="profile" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-bold text-neutral-900">{profile.displayName}</p>
            <p className="text-xs text-neutral-600">
              취향 {profile.tasteCount}개 · 친구 {profile.friendCount}명
            </p>
          </div>
          <Link
            href="/signup/profile?returnTo=%2Fmy"
            className="inline-flex h-8 shrink-0 items-center rounded-[10px] border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-700 active:bg-rose-100"
          >
            편집
          </Link>
        </header>
        <div className="flex flex-col gap-5 px-5">
          {MENU_SECTIONS.map((section) => (
            <section key={section.title} aria-labelledby={`my-${section.title}`}>
              <h2 id={`my-${section.title}`} className="mb-2 text-sm font-semibold text-neutral-600">
                {section.title}
              </h2>
              <MenuCard>
                {section.items.map((item) => (
                  <MenuRow
                    key={item.label}
                    {...item}
                    badge={item.label === "결제수단" && hasExpiredMethod ? "만료됨" : undefined}
                  />
                ))}
              </MenuCard>
            </section>
          ))}
          <form action={signOut}>
            <button
              type="submit"
              className="flex h-12 w-full items-center justify-center rounded-xl bg-neutral-100 text-[15px] font-semibold text-error-600 active:bg-neutral-200"
            >
              로그아웃
            </button>
          </form>
        </div>
      </main>
      <BottomNav active="my" />
    </>
  );
}
