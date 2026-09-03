import Link from "next/link";
import { Gift, Home, User, Users } from "lucide-react";

export type BottomNavTab = "home" | "friends" | "gifts" | "my";

const TABS: { key: BottomNavTab; label: string; href: string; Icon: typeof Home }[] = [
  { key: "home", label: "홈", href: "/", Icon: Home },
  { key: "friends", label: "친구", href: "/friends", Icon: Users },
  { key: "gifts", label: "선물", href: "/products", Icon: Gift },
  { key: "my", label: "마이", href: "/my", Icon: User },
];

export function BottomNav({ active }: { active: BottomNavTab }) {
  return (
    <nav
      aria-label="주 메뉴"
      className="sticky bottom-0 z-10 flex shrink-0 border-t border-neutral-200 bg-surface px-2 pb-[env(safe-area-inset-bottom)] pt-1.5"
    >
      {TABS.map(({ key, label, href, Icon }) => {
        const isActive = key === active;
        return (
          <Link
            key={key}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className="flex flex-1 flex-col items-center gap-1 pb-1.5 pt-0.5"
          >
            <span
              className={`rounded-xl px-[18px] py-[3px] ${isActive ? "bg-rose-50 text-rose-600" : "text-neutral-500"}`}
            >
              <Icon size={22} aria-hidden />
            </span>
            <span
              className={`text-xs ${isActive ? "font-semibold text-rose-700" : "text-neutral-500"}`}
            >
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
