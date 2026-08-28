import { LinkButton } from "@/components/ui/button";
import { LoginErrorNotice } from "@/app/login/login-buttons";

/**
 * 랜딩 (SCR-M0-01) — 비로그인 첫 화면. 로그인 상태 리다이렉트는 인증 연동 시 proxy.ts가 맡는다.
 * Supabase 는 인증 실패를 Site URL(루트)로도 떨어뜨리므로 여기서도 실패 배너를 보여준다 —
 * 에러는 쿼리(?error=)나 해시(#error_description=)로 온다.
 */
export default async function LandingPage({ searchParams }: PageProps<"/">) {
  const { error } = await searchParams;
  const errorCode = typeof error === "string" ? error : undefined;

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
