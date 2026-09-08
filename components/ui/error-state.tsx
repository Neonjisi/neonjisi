import { CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BottomNav } from "@/components/ui/bottom-nav";
import { TopBar } from "@/components/ui/top-bar";

type ErrorStateProps = {
  title: string;
  description: string;
  onRetry: () => void;
};

/** 에러 상태 프레젠테이션 (SCR-C-02) — error.tsx 경계가 사용한다 */
export function ErrorState({ title, description, onRetry }: ErrorStateProps) {
  return (<>
    <TopBar backHref="/" />
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-5 pb-16 text-center">
      <span className="grid size-[72px] place-items-center rounded-full bg-error-50">
        <CircleAlert size={32} className="text-error-500" aria-hidden />
      </span>
      <h1 className="text-xl font-bold text-neutral-900">{title}</h1>
      <p className="text-sm leading-relaxed text-neutral-600">{description}</p>
      <Button onClick={onRetry} className="mt-2 min-w-40">
        다시 시도
      </Button>
    </main>
    <BottomNav />
  </>);
}
