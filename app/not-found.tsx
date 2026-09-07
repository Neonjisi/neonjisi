import Link from "next/link";
import { Compass } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";

/**
 * 전역 404 (SCR-C-02 계열) — `notFound()` 가 닿는 모든 자리의 화면.
 *
 * 이 파일이 없던 동안에는 Next 기본 화면("404 · This page could not be found")이 떴다.
 * 영문인 데다 앱 껍데기가 통째로 빠져 돌아갈 길이 없었고, `notFound()` 호출 지점이 18곳이라
 * 없는 주소뿐 아니라 **볼 권한이 없는 리소스**(비친구가 펀딩 상세를 여는 FR-024 경로 등)도
 * 전부 그 화면으로 떨어졌다.
 *
 * ⚠️ 문구는 존재 여부를 알리지 않는다. 조회 DAL 들이 "없는 것과 같은 응답"(null)을 주도록
 *    설계된 이유와 같다 — "권한이 없어요"라고 말하면 그 id 가 실재한다는 힌트가 된다.
 */
export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-5 pb-16 text-center">
      <span className="grid size-[72px] place-items-center rounded-full bg-neutral-100">
        <Compass size={32} className="text-neutral-400" aria-hidden />
      </span>
      <h1 className="text-xl font-bold text-neutral-900">페이지를 찾을 수 없어요</h1>
      <p className="text-sm leading-relaxed text-neutral-600">
        주소가 바뀌었거나 사라진 화면이에요.
        <br />
        홈에서 다시 시작해보세요.
      </p>
      <Link href="/" className={`${buttonClasses("primary", "lg")} mt-2 min-w-40`}>
        홈으로
      </Link>
    </main>
  );
}
