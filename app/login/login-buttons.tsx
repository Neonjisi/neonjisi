"use client";

import { useState, useSyncExternalStore } from "react";
import { CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * FR-019 — Google 로그인 (소셜 1종 확정).
 * 성공 시 Google → /auth/callback(T020) → /taste 로 돌아오고,
 * 온보딩 여부는 /taste 의 requireOnboarded() 가 판정한다 (FR-018).
 */
/**
 * 로그인 실패 안내 — 콜백이 붙인 ?error= 로 표시하고,
 * Supabase 가 해시(#error_description=…)로 전달한 상세를 브라우저에서 읽어 덧붙인다.
 * (해시는 서버로 전송되지 않아 클라이언트에서만 읽을 수 있다)
 */
const noopSubscribe = () => () => {};

function readHashErrorDescription(): string | null {
  try {
    return new URLSearchParams(window.location.hash.slice(1)).get("error_description");
  } catch {
    return null; // 해시 파싱 실패는 무시 — 기본 안내만 보여준다
  }
}

export function LoginErrorNotice({ code }: { code?: string }) {
  // 해시는 서버로 전송되지 않으므로 SSR 스냅샷은 null, 브라우저에서만 읽는다.
  const detail = useSyncExternalStore(noopSubscribe, readHashErrorDescription, () => null);

  if (!code && !detail) return null;
  return (
    <div
      role="alert"
      className="flex w-full items-start gap-2 rounded-xl bg-error-50 px-3.5 py-3"
    >
      <CircleAlert size={18} className="mt-0.5 shrink-0 text-error-500" aria-hidden />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-error-700">
          로그인을 완료하지 못했어요. 다시 시도해주세요.
        </p>
        {detail && <p className="break-all pt-1 text-xs text-error-700/80">{detail}</p>}
      </div>
    </div>
  );
}

export function GoogleLoginButton({
  nextPath = "/taste",
  label = "Google로 시작하기",
  variant = "primary",
}: {
  nextPath?: string;
  label?: string;
  variant?: "primary" | "tertiary";
}) {
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleLogin = async () => {
    setIsPending(true);
    setErrorMessage(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
      },
    });
    if (error) {
      setErrorMessage("로그인을 시작하지 못했어요. 잠시 후 다시 시도해주세요.");
      setIsPending(false);
    }
    // 성공하면 Google 로 리다이렉트되므로 pending 상태를 유지한다.
  };

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <Button size="lg" variant={variant} disabled={isPending} onClick={handleLogin}>
        {isPending ? "Google로 이동 중…" : label}
      </Button>
      {errorMessage && <p className="text-sm text-error-700">{errorMessage}</p>}
    </div>
  );
}
