import { LinkButton } from "@/components/ui/button";
import { LoginErrorNotice } from "@/app/login/login-buttons";
import { FundingCard } from "@/components/funding/funding-card";
import { BottomNav } from "@/components/ui/bottom-nav";
import { getHomeFundings } from "@/lib/dal/funding";
import { getOptionalSession } from "@/lib/dal/session";
import { BrandLogo } from "@/components/ui/brand-logo";
import { GiftCountdown } from "@/components/gift/countdown";
import { getPendingRequestsForMe } from "@/lib/dal/gift";
import { getUpcomingEvents } from "@/lib/dal/event";

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
    const [fundings, pendingGifts, upcomingEvents] = await Promise.all([
      getHomeFundings(),
      getPendingRequestsForMe(),
      getUpcomingEvents(),
    ]);
    return (
      <>
        <main className="flex-1 px-5 pb-8 pt-7">
          <header className="flex items-center gap-1">
            <h1 className="sr-only">넌지시</h1>
            <BrandLogo href="/" priority />
            <BrandLogo variant="typo" priority className="-ml-3" />
          </header>
          {pendingGifts.length ? (
            <section className="mt-8" aria-labelledby="pending-gifts">
              <h2 id="pending-gifts" className="text-lg font-bold">확인이 필요한 선물</h2>
              <ul className="mt-3 space-y-3">
                {pendingGifts.slice(0, 1).map((gift) => (
                  <li key={gift.id}>
                    <LinkButton href={`/gifts/${gift.id}`} variant="secondary" className="h-auto min-h-20 justify-between px-4 py-3 text-left">
                      <span><strong className="block">{gift.counterpartDisplayName}님이 보낸 선물</strong><span className="mt-1 block text-sm font-normal text-neutral-600">응답 기다리는 중 · {gift.productSnapshot.name}</span></span>
                      <GiftCountdown respondDueAt={gift.respondDueAt} serverNow={gift.serverNow} className="text-base" />
                    </LinkButton>
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
          <section className="mt-8" aria-labelledby="upcoming-events">
            <div className="flex items-center justify-between"><h2 id="upcoming-events" className="text-lg font-bold">다가오는 일정</h2><LinkButton href="/events" variant="tertiary">관리</LinkButton></div>
            {upcomingEvents.length ? <ul className="mt-3 space-y-2">{upcomingEvents.slice(0, 3).map((event) => <li key={event.id} className="rounded-[20px] bg-surface p-4"><strong>{event.title}</strong><p className="mt-1 text-sm text-neutral-600">{event.isMine ? '내 일정' : `${event.ownerDisplayName}님`} · {event.nextDate.toISOString().slice(0, 10)}</p></li>)}</ul> : <p className="mt-3 rounded-[20px] bg-surface p-5 text-sm text-neutral-600">다가오는 일정이 없어요.</p>}
          </section>
          <section className="mt-8" aria-labelledby="home-fundings">
            <div className="flex items-center justify-between">
              <h2 id="home-fundings" className="text-lg font-bold">진행 중인 펀딩</h2>
              <LinkButton href="/my/fundings" variant="tertiary">전체 보기</LinkButton>
            </div>
            {fundings.length ? <ul className="mt-3 space-y-3">{fundings.map((funding) => <FundingCard key={funding.id} funding={funding} returnTo="/" />)}</ul> : <div className="mt-3 rounded-[20px] bg-surface p-5"><p className="font-semibold">지금은 조용하네요</p><p className="mt-1 text-sm text-neutral-600">함께 준비할 선물을 찾아보세요.</p><LinkButton href="/products" variant="secondary" className="mt-4">선물 둘러보기</LinkButton></div>}
          </section>
        </main>
        <BottomNav active="home" />
      </>
    );
  }

  return (
    <main className="flex flex-1 flex-col px-5 pb-10 pt-8">
      <div className="flex flex-1 flex-col items-center justify-center gap-3 pb-16">
        <h1 className="sr-only">넌지시</h1>
        <BrandLogo variant="korean" size="lg" priority />
        <p className="text-base text-neutral-600">나를 아는 선물.</p>
      </div>
      <div className="flex flex-col items-center gap-3">
        <LoginErrorNotice code={errorCode} />
        <LinkButton href="/login" size="lg">
          Google로 시작하기
        </LinkButton>
        <LinkButton href="/login" variant="tertiary" className="mt-1">
          이미 계정이 있어요
        </LinkButton>
      </div>
    </main>
  );
}
