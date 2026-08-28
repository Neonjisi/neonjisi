import { TopBar } from "@/components/ui/top-bar";
import { GoogleLoginButton, LoginErrorNotice } from "./login-buttons";

/**
 * 로그인 · 가입 (SCR-M0-02 · T021) — 소셜 로그인 1종(Google) 확정 (FR-019).
 * 신규·기존 계정 모두 같은 버튼을 쓴다 — Supabase 가 가입과 로그인을 구분해 처리한다.
 */
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  const errorCode = typeof error === "string" ? error : undefined;

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
          <LoginErrorNotice code={errorCode} />
          <GoogleLoginButton />
          <p className="pt-2 text-xs text-neutral-500">
            로그인하면 이용약관과 개인정보처리방침에 동의하는 것으로 봅니다.
          </p>
        </div>
      </main>
    </>
  );
}
