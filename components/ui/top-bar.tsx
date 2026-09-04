import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { BrandLogo } from "@/components/ui/brand-logo";

type TopBarProps = {
  title?: string;
  backHref?: string;
  action?: ReactNode;
  /** 배경을 화면 배경색과 맞출 때 사용 (기본은 흰색 surface) */
  isTransparent?: boolean;
};

export function TopBar({ title, backHref, action, isTransparent = false }: TopBarProps) {
  return (
    <header
      className={`flex h-14 shrink-0 items-center gap-1 px-2 ${isTransparent ? "" : "bg-surface"}`}
    >
      {backHref ? (
        <Link
          href={backHref}
          aria-label="뒤로 가기"
          className="grid size-10 shrink-0 place-items-center rounded-full text-neutral-900 active:bg-neutral-100"
        >
          <ChevronLeft size={22} />
        </Link>
      ) : (
        <BrandLogo href="/" />
      )}
      <h1 className="flex-1 truncate text-center text-base font-semibold text-neutral-900">
        {title}
      </h1>
      <span className="grid size-10 shrink-0 place-items-center">{action}</span>
    </header>
  );
}
