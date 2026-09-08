import { LinkButton } from "@/components/ui/button";
import Link from "next/link";
import Image from "next/image";
import { Bell, Clock } from "lucide-react";
import { LoginErrorNotice } from "@/app/login/login-buttons";
import { FundingCard } from "@/components/funding/funding-card";
import { BottomNav } from "@/components/ui/bottom-nav";
import { getHomeFundings } from "@/lib/dal/funding";
import { getOptionalSession } from "@/lib/dal/session";
import { BrandLogo } from "@/components/ui/brand-logo";
import { GiftCountdown } from "@/components/gift/countdown";
import { getPendingRequestsForMe } from "@/lib/dal/gift";
import { getUpcomingEvents } from "@/lib/dal/event";
import { getNotificationIndicator } from "@/lib/dal/notification";
import { HomeNotificationSync } from "@/components/notification/home-notification-sync";
import { TopBar } from "@/components/ui/top-bar";

/**
 * 랜딩 (SCR-M0-01) — 비로그인 첫 화면. 로그인 상태 리다이렉트는 인증 연동 시 proxy.ts가 맡는다.
 * Supabase 는 인증 실패를 Site URL(루트)로도 떨어뜨리므로 여기서도 실패 배너를 보여준다 —
 * 에러는 쿼리(?error=)나 해시(#error_description=)로 온다.
 */
export default async function LandingPage({ searchParams }: PageProps<"/">) {
  const { error } = await searchParams;
  const errorCode = typeof error === "string" ? error : undefined;
  const session = await getOptionalSession();

  if (session) {
    const [fundings, pendingGifts, upcomingEvents, notificationIndicator] = await Promise.all([
      getHomeFundings(),
      getPendingRequestsForMe(),
      getUpcomingEvents(),
      getNotificationIndicator(),
    ]);
    const { unreadCount } = notificationIndicator;
    return (
      <>
        <HomeNotificationSync initialIndicator={notificationIndicator} />
        <header className="sticky top-0 z-20 flex h-20 shrink-0 items-center justify-between bg-app px-2 pt-6">
            <h1 className="sr-only">넌지시</h1>
            <BrandLogo href="/" priority />
            <Link
              href="/notifications?from=home"
              aria-label={unreadCount > 0 ? `알림, 읽지 않은 알림 ${unreadCount}개` : "알림"}
              className="relative grid size-10 shrink-0 place-items-center rounded-full text-neutral-900 active:bg-neutral-100"
            >
              <Bell size={24} aria-hidden />
              {unreadCount > 0 ? (
                <span
                  aria-hidden
                  className="absolute right-0 top-0 grid min-h-[18px] min-w-[18px] place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white"
                >
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              ) : null}
            </Link>
        </header>
        <main className="flex-1 space-y-5 px-5 pb-8 pt-4">
          {pendingGifts.length ? (
            <section aria-labelledby="pending-gifts">
              <h2 id="pending-gifts" className="text-lg font-bold">확인이 필요한 선물</h2>
              <ul className="mt-2 space-y-3">
                {pendingGifts.slice(0, 1).map((gift) => (
                  <li key={gift.id} className="rounded-[20px] bg-surface p-4">
                    <div className="flex items-center gap-3">
                      <div className="relative size-[52px] shrink-0 overflow-hidden rounded-xl bg-rose-50">
                        {gift.productSnapshot.imageUrl ? <Image src={gift.productSnapshot.imageUrl} alt="" fill sizes="52px" className="object-cover" /> : null}
                      </div>
                      <div className="min-w-0 flex-1"><strong className="block truncate">{gift.counterpartDisplayName}님이 보낸 선물</strong><span className="mt-1 block truncate text-sm text-neutral-600">{gift.productSnapshot.name} · {gift.productSnapshot.price.toLocaleString('ko-KR')}원</span></div>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-sm"><span className="text-neutral-600">남은 시간</span><span className="flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1"><Clock size={14} aria-hidden /><GiftCountdown respondDueAt={gift.respondDueAt} serverNow={gift.serverNow} className="text-sm" /></span></div>
                    <LinkButton href={`/gifts/${gift.id}?returnTo=%2F`} size="lg" className="mt-3">확인하기</LinkButton>
                  </li>
                ))}
                {pendingGifts.slice(1).map((gift) => (
                  <li key={gift.id}>
                    <LinkButton href={`/gifts/${gift.id}`} variant="tertiary" className="h-auto min-h-12 justify-between px-4 py-2 text-left">
                      <span className="min-w-0 truncate text-sm"><strong>{gift.counterpartDisplayName}님</strong> · {gift.productSnapshot.name}</span>
                      <GiftCountdown respondDueAt={gift.respondDueAt} serverNow={gift.serverNow} className="ml-3 shrink-0 text-sm" />
                    </LinkButton>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <section aria-labelledby="upcoming-events">
            <h2 id="upcoming-events" className="text-lg font-bold">다가오는 일정</h2>
            {upcomingEvents.length ? <ul className="mt-2 divide-y divide-neutral-100 rounded-[20px] bg-surface px-4">{upcomingEvents.slice(0, 3).map((event) => <li key={event.id} className="flex items-center gap-3 py-3"><div className="grid size-10 shrink-0 place-items-center rounded-full bg-violet-50 text-xs font-bold text-violet-700">{event.ownerDisplayName.slice(0, 2)}</div><div className="min-w-0 flex-1"><strong className="block truncate">{event.ownerDisplayName}</strong><p className="text-sm text-neutral-600">{event.title}</p></div><span className="shrink-0 rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold">{event.daysUntil === 0 ? "오늘" : `D-${event.daysUntil}`}</span></li>)}</ul> : <p className="mt-2 rounded-[20px] bg-surface p-5 text-sm text-neutral-600">다가오는 일정이 없어요.</p>}
          </section>
          <section aria-labelledby="home-fundings">
            <h2 id="home-fundings" className="text-lg font-bold">진행 중인 펀딩</h2>
            {fundings.length ? <ul className="mt-2 space-y-3">{fundings.map((funding) => <FundingCard key={funding.id} funding={funding} returnTo="/" />)}</ul> : <div className="mt-2 rounded-[20px] bg-surface p-5"><p className="font-semibold">지금은 조용하네요</p><p className="mt-1 text-sm text-neutral-600">함께 준비할 선물을 찾아보세요.</p><LinkButton href="/products" variant="secondary" className="mt-4">선물 둘러보기</LinkButton></div>}
          </section>
        </main>
        <BottomNav active="home" />
      </>
    );
  }

  return (
    <>
    <TopBar showNotifications={false} />
    <main className="flex flex-1 flex-col px-5 pb-10 pt-4">
      <div className="flex flex-1 flex-col items-center justify-center gap-3 pb-16">
        <h1 className="sr-only">넌지시</h1>
        <BrandLogo variant="korean" size="lg" priority />
        <p className="text-base text-neutral-600">나를 아는 선물.</p>
      </div>
      <div className="flex flex-col items-center gap-3">
        <LoginErrorNotice code={errorCode} />
        <LinkButton href="/login" size="lg">시작하기</LinkButton>
      </div>
    </main>
    </>
  );
}
