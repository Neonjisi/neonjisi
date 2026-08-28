import { LinkButton } from "@/components/ui/button";
import { TopBar } from "@/components/ui/top-bar";

/**
 * 로그인 · 가입 (SCR-M0-02 · T021).
 * 인증 방식은 미확정(도메인 모델 §13-2) — 버튼은 경로만 정의하고
 * Supabase 인증 연동 시 실제 핸들러로 교체한다.
 */
export default function LoginPage() {
  return (
    <>
      <TopBar title="시작하기" backHref="/" />
      <main className="flex flex-1 flex-col px-5 pb-8 pt-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold text-neutral-900">넌지시를 시작해요</h1>
          <p className="text-sm text-neutral-600">
            계정을 만들거나 로그인하면 취향을 기록할 수 있어요.
          </p>
        </div>
        <div className="mt-auto flex flex-col items-center gap-3">
          <LinkButton href="/signup/profile" size="lg">
            소셜 계정으로 계속하기
          </LinkButton>
          <LinkButton href="/signup/profile" variant="secondary" size="lg">
            이메일로 계속하기
          </LinkButton>
          <LinkButton href="/signup/profile" variant="tertiary" className="mt-1">
            이미 계정이 있어요
          </LinkButton>
          <p className="pt-2 text-xs text-neutral-500">
            인증 방식은 확정 후 연결됩니다 · OPEN QUESTION
          </p>
        </div>
      </main>
    </>
  );
}
