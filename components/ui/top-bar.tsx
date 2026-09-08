import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { BrandLogo } from "@/components/ui/brand-logo";
import { HeaderNotificationLink } from "@/components/notification/header-notification-link";

type TopBarProps = {
  title?: string;
  backHref?: string;
  action?: ReactNode;
  showNotifications?: boolean;
};

export function TopBar({ title, backHref, action, showNotifications = true }: TopBarProps) {
  return (
    <header className="sticky top-0 z-20 flex h-20 shrink-0 items-center bg-app px-2 pt-6">
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
      <h1 className="pointer-events-none absolute inset-x-20 bottom-0 flex h-14 items-center justify-center truncate text-center text-base font-semibold text-neutral-900">
        {title}
      </h1>
      <span className="ml-auto flex items-center">
        {action ? <span className="grid size-10 shrink-0 place-items-center">{action}</span> : null}
        {showNotifications ? <HeaderNotificationLink /> : <span className="size-10" />}
      </span>
    </header>
  );
}
