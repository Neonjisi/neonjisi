import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight, User } from "lucide-react";
import { BottomNav } from "@/components/ui/bottom-nav";
import { MOCK_USER } from "@/lib/mock/taste-data";

/** 마이 탭 (SCR-M1-06). 내 취향 외 메뉴는 해당 마일스톤에서 연결한다. */

// M2 에서 "알림"과 "초대 링크 관리"가 실제 화면으로 연결됐다 (T045·T046). 알림 배지가 있는
// 홈(SCR-M3-01)은 M3 이라, 그때까지는 마이 탭이 두 화면의 유일한 진입점이다.
const MAIN_MENU: { label: string; href: string }[] = [
  { label: "내 취향", href: "/taste" },
  { label: "알림", href: "/notifications" },
  { label: "선물 내역", href: "#" },
  { label: "펀딩 내역", href: "#" },
  { label: "결제수단", href: "#" },
  { label: "초대 링크 관리", href: "/friends/invite/manage" },
];

const SUB_MENU: { label: string; href: string }[] = [
  { label: "알림 설정", href: "#" },
  { label: "약관 · 개인정보처리방침", href: "#" },
];

function MenuCard({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-neutral-100 rounded-[20px] bg-surface px-4">{children}</div>;
}

function MenuRow({ label, href }: { label: string; href: string }) {
  return (
    <Link href={href} className="flex h-[52px] items-center justify-between active:bg-neutral-50">
      <span className="text-[15px] text-neutral-900">{label}</span>
      <ChevronRight size={20} className="text-neutral-400" aria-hidden />
    </Link>
  );
}

export default function MyPage() {
  return (
    <>
      <main className="flex-1 pb-6">
        <header className="flex items-center gap-3 px-5 pb-4 pt-6">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-apricot-100">
            <User size={24} className="text-apricot-700" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-bold text-neutral-900">{MOCK_USER.name}</p>
            <p className="text-xs text-neutral-600">
              취향 {MOCK_USER.tasteCount}개 · 친구 {MOCK_USER.friendCount}명
            </p>
          </div>
          <Link
            href="/signup/profile"
            className="shrink-0 rounded-full border border-rose-200 bg-rose-50 px-4 py-1.5 text-sm font-semibold text-rose-700 active:bg-rose-100"
          >
            편집
          </Link>
        </header>
        <div className="flex flex-col gap-4 px-5">
          <MenuCard>
            {MAIN_MENU.map((item) => (
              <MenuRow key={item.label} {...item} />
            ))}
          </MenuCard>
          <MenuCard>
            {SUB_MENU.map((item) => (
              <MenuRow key={item.label} {...item} />
            ))}
            <button
              type="button"
              className="flex h-[52px] w-full items-center text-[15px] text-error-600 active:bg-neutral-50"
            >
              로그아웃
            </button>
          </MenuCard>
        </div>
      </main>
      <BottomNav active="my" />
    </>
  );
}
