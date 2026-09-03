import { LinkButton } from "@/components/ui/button";
import { LoginErrorNotice } from "@/app/login/login-buttons";
import { FundingCard } from "@/components/funding/funding-card";
import { BottomNav } from "@/components/ui/bottom-nav";
import { getHomeFundings } from "@/lib/dal/funding";
import { getOptionalSession } from "@/lib/dal/session";

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
    const fundings = await getHomeFundings();
    return (
      <>
        <main className="flex-1 px-5 pb-8 pt-7">
          <header>
            <p className="text-sm text-neutral-600">나를 아는 선물</p>
            <h1 className="mt-1 text-2xl font-extrabold text-rose-500">넌지시</h1>
          </header>
          <section className="mt-8" aria-labelledby="home-fundings">
            <div className="flex items-center justify-between">
              <h2 id="home-fundings" className="text-lg font-bold">진행 중인 펀딩</h2>
              <LinkButton href="/my/fundings" variant="tertiary">전체 보기</LinkButton>
            </div>
            {fundings.length ? <ul className="mt-3 space-y-3">{fundings.map((funding) => <FundingCard key={funding.id} funding={funding} />)}</ul> : <div className="mt-3 rounded-[20px] bg-surface p-5"><p className="font-semibold">지금은 조용하네요</p><p className="mt-1 text-sm text-neutral-600">함께 준비할 선물을 찾아보세요.</p><LinkButton href="/products" variant="secondary" className="mt-4">선물 둘러보기</LinkButton></div>}
          </section>
        </main>
        <BottomNav active="home" />
      </>
    );
  }

  return (
    <main className="flex flex-1 flex-col px-5 pb-10 pt-8">
      <div className="flex flex-1 flex-col items-center justify-center gap-3 pb-16">
        <h1 className="text-[40px] font-bold tracking-[-0.03em] text-rose-500">넌지시</h1>
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
