# Implementation Plan: 맞춤 취향 프로필

**Branch**: `main` (git 확장 미설치) | **Date**: 2026-08-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-taste-profile/spec.md`

## Summary

사용자가 자신의 맞춤 취향(`원하는 것` / `이미 있는 것` / `필요 없는 것` + 취향 서술)을 기록하고
다시 볼 수 있게 한다. 마일스톤 2~4가 쓸 자산을 만드는 층이다.

기술적 접근: Next.js 16 App Router에서 **Server Component를 기본**으로 화면을 구성하고, 쓰기는
**Server Action**으로 처리한다. 인가는 **DAL(Data Access Layer) 단일 지점**에 모으고, `proxy.ts`는
쿠키만 읽는 optimistic 리다이렉트에만 쓴다. 데이터는 Supabase PostgreSQL에 Prisma로 접근하며,
Prisma 스키마로 표현되지 않는 제약은 raw SQL 마이그레이션으로 명시한다.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20+

**Primary Dependencies**: Next.js **16.3.2** (App Router), React 19.2.8, Tailwind CSS v4,
Prisma (신규), `@supabase/supabase-js` + `@supabase/ssr` (신규), Zod (신규, 입력 검증)

**Storage**: Supabase PostgreSQL. 애플리케이션은 Prisma로 접근한다

**Testing**: Vitest + React Testing Library(단위·컴포넌트), Playwright(E2E).
`package.json`에 `test` 스크립트가 **아직 없다** — 러너 도입이 첫 작업이다

**Target Platform**: 웹 브라우저. 모바일 기준 반응형(FR-017)

**Project Type**: web application — Next.js 단일 앱. 프론트엔드/백엔드를 분리하지 않는다

**Performance Goals**: 신규 사용자가 온보딩 필수 항목을 3분 이내 완료(SC-001).
등록·수정·삭제가 재조회 시 100% 반영(SC-003)

**Constraints**: 폭 360px에서 가로 스크롤 없음(SC-006). 취향 항목 수 상한 없음

**Scale/Scope**: 팀 과제 시연 규모. 화면 3종(온보딩 · 취향 조회 · 취향 항목 편집),
엔티티 4종(Category · User · TasteProfile · TasteItem)

## Constitution Check

*GATE: Phase 0 이전에 통과해야 하며, Phase 1 설계 후 재평가한다.*

| 원칙 | 판정 | 근거 |
|---|---|---|
| **I. 결정에는 근거가 붙는다** | ✅ 통과 | 모든 기술 선택을 [research.md](./research.md)에 Decision / Rationale / Alternatives 형식으로 기록한다 |
| **II. 테스트 우선 (NON-NEGOTIABLE)** | ⚠️ **조건부 통과** | 현재 `test` 스크립트가 없어 원칙을 지킬 수단 자체가 없다. **러너 도입을 첫 작업으로 강제**하는 조건에서만 통과. 아래 Complexity Tracking 참조 |
| **III. Server Component가 기본이다** | ✅ 통과 | 화면은 Server Component, 쓰기는 Server Action. `'use client'`는 폼 입력 상태와 낙관적 UI에만 적용한다 |
| **IV. 거래는 스냅샷으로 자립한다** | ➖ 해당 없음 | M1에는 거래(GiftRequest·Funding)가 없다. M3에서 재평가한다 |
| **V. 연기는 후행 비용이 낮은 쪽으로** | ✅ 통과 | M1 스키마에 M2~M4 컬럼을 미리 넣지 않는다. `TasteItem.product_id`(M3)와 `visibility`(Future)는 후행 추가 비용이 낮아 연기한다 |

**데이터 보호**

| 항목 | 판정 | 근거 |
|---|---|---|
| 취향 데이터를 민감정보로 취급 | ✅ | M1에서는 본인 외 어떤 경로로도 노출되지 않는다 |
| 접근 제어를 단일 규칙으로 한 곳에 | ⚠️ **주의** | Prisma는 DB에 직접 연결하므로 **Supabase RLS를 우회한다.** 따라서 M1에서 DAL이 **유일한** 접근 제어 지점이다. 2차 방어선이 없다는 뜻이므로 DAL을 우회하는 데이터 접근을 금지한다. RLS 병행 여부는 M2(친구 열람)에서 재검토한다 |
| 카드번호·CVC 미저장 | ➖ 해당 없음 | M1에 결제 없음 |
| `consent_version` 상승 의무 | ➖ 해당 없음 | M1에 동의 절차 없음 |

**품질 게이트**

| 항목 | 판정 |
|---|---|
| `npm run build` / `npm run lint` 통과 후 완료 선언 | ✅ 계획에 반영 |
| 컴포넌트 200~400줄, 500줄 초과 시 분해 | ✅ 화면 3종을 하위 컴포넌트로 분해 |
| 상태·객체 불변 | ✅ |
| `@/*` 절대 경로 임포트 | ✅ `tsconfig`에 이미 설정됨 (`@/*` → `./*`) |
| `error.tsx` 경계 | ✅ 취향 영역에 배치 |

## Project Structure

### Documentation (this feature)

```text
specs/001-taste-profile/
├── plan.md              # 이 파일
├── research.md          # Phase 0 산출물
├── data-model.md        # Phase 1 산출물 — M1 부분만. 전체는 docs/specs/ 원문
├── quickstart.md        # Phase 1 산출물
├── contracts/           # Phase 1 산출물
│   └── server-actions.md
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 산출물 (/speckit-tasks — 이 명령이 만들지 않음)
```

### Source Code (repository root)

```text
app/
├── layout.tsx                  # 기존
├── page.tsx                    # 기존
├── auth/
│   └── callback/route.ts       # Supabase Auth 콜백
├── login/
│   └── page.tsx                # FR-019 — 소셜 로그인 1종 진입
├── onboarding/
│   ├── page.tsx                # US1 — 이미 있는 것 / 필요 없는 것 등록
│   └── error.tsx
└── taste/
    ├── page.tsx                # US1·US2 조회 — 종류별 묶음
    ├── error.tsx
    └── actions.ts              # Server Actions (생성·수정·삭제·취향 서술)

components/
├── taste/
│   ├── taste-item-list.tsx     # 종류별 묶음 렌더 (Server)
│   ├── taste-item-form.tsx     # 'use client' — 입력 상태
│   ├── category-picker.tsx     # 'use client' — 대분류 선택
│   └── description-editor.tsx  # 'use client' — 취향 서술
└── ui/                         # 공용 프리미티브

lib/
├── dal/
│   ├── session.ts              # verifySession() — cache()로 메모이즈
│   └── taste.ts                # 취향 조회. 인가를 통과한 결과만 반환
├── supabase/
│   ├── server.ts
│   └── client.ts
├── validation/
│   └── taste-item.ts           # Zod 스키마 + 모순 방지(FR-010)
└── prisma.ts

prisma/
├── schema.prisma
├── migrations/                 # NULLS NOT DISTINCT 유니크는 raw SQL로
└── seed.ts                     # Category 30~50개 (FR-005)

proxy.ts                        # Next.js 16 — 쿠키만 읽는 optimistic 체크

tests/
├── unit/                       # 검증 로직, DAL 순수 함수
├── integration/                # Server Actions + DB
└── e2e/                        # 온보딩·취향 화면 (async Server Component)
```

**Structure Decision**: Next.js 단일 앱 구조를 쓴다. 템플릿의 "Web application(frontend/backend
분리)" 옵션을 쓰지 않는 이유는, App Router의 Server Component와 Server Action이 서버 코드를 같은
트리 안에 두기 때문이다. 별도 백엔드를 만들면 DAL이 두 곳으로 갈라져 constitution의 "접근 제어를
한 곳에" 원칙이 깨진다.

라우트는 `app/` 아래에 두고(CLAUDE.md), 도메인 로직은 `lib/`에 둔다. `components/`와 `lib/`를
리포 루트에 두는 이유는 `tsconfig`의 `@/*`가 `./*`로 매핑되어 있어 `@/lib/dal/session` 형태의
임포트가 그대로 성립하기 때문이다.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| 원칙 II를 "조건부 통과"로 열어둠 | 현재 리포에 테스트 러너와 `test` 스크립트가 없다. 원칙을 지킬 수단이 존재하지 않는 상태다 | "일단 구현하고 나중에 테스트 추가"는 원칙 II가 명시적으로 금지한다. 따라서 러너 도입을 **첫 작업**으로 강제하고, 그 전에는 어떤 기능 코드도 쓰지 않는 조건으로 게이트를 통과시킨다 |
| DAL이 유일한 접근 제어 지점 (2차 방어선 없음) | Prisma가 DB에 직접 연결하면 Supabase RLS가 적용되지 않는다. M1에서 RLS를 병행하려면 Prisma 연결 롤과 세션 컨텍스트 전파를 별도로 설계해야 한다 | M1은 **본인만 자기 데이터에 접근**하는 단순 구조라 DAL 하나로 규칙이 완결된다. 타인이 열람하는 M2에서는 상황이 달라지므로 그때 RLS 병행을 재검토한다. 지금 도입하면 검증할 시나리오가 없는 방어선을 만드는 셈이다 |

## Constitution Check — 설계 후 재평가

*Phase 1 완료 시점(2026-08-27) 재평가.*

| 원칙 | 판정 | 설계에서 확인된 것 |
|---|---|---|
| **I. 결정에는 근거가 붙는다** | ✅ 유지 | [research.md](./research.md) R1~R7 전부 Decision / Rationale / Alternatives 형식. 미해결 항목 0건 |
| **II. 테스트 우선** | ⚠️ 조건 유지 | 테스트 3층 구조를 R5에서 확정했고 [quickstart.md](./quickstart.md)에 실행 절차를 넣었다. 러너 도입이 첫 작업이라는 조건은 그대로다 |
| **III. Server Component가 기본이다** | ✅ 유지 | `'use client'`는 폼·선택기·서술 편집기 **3개로 한정**했다. 목록 렌더는 Server Component다 |
| **IV. 거래는 스냅샷으로 자립한다** | ➖ 해당 없음 | 변동 없음 |
| **V. 연기는 후행 비용이 낮은 쪽으로** | ✅ 유지 | [data-model.md](./data-model.md) "M1에서 의도적으로 넣지 않은 것"에 4건과 각각의 후행 비용을 명시했다 |

**데이터 보호** — DAL 단독 방어선이라는 조건이 설계에 반영되었다:
`lib/prisma.ts`를 컴포넌트·Server Action에서 직접 임포트하지 않고 반드시 `lib/dal/*`을 거친다
(contracts/server-actions.md). 이 규칙이 깨지면 M1에는 이를 잡아줄 2차 방어선이 없다.

**품질 게이트 — 한 가지 명확히 해둘 것**: constitution은 "에러는 `error.tsx` 경계로 처리한다"고
정한다. 설계는 이를 **예상 가능한 실패와 예상 못 한 실패로 나눠** 적용한다.

| 실패 종류 | 처리 | 근거 |
|---|---|---|
| 예상 가능 (중복·모순·검증 실패·저장 실패) | `ActionResult`의 값으로 반환 | FR-016이 "입력 내용을 보존"할 것을 요구한다. 예외로 던지면 `error.tsx`가 화면을 갈아치우며 입력이 사라진다 |
| 예상 못 한 것 (DB 연결 끊김, 버그) | 예외 → `error.tsx` 경계 | constitution 그대로 |

`error.tsx`는 `app/onboarding/`과 `app/taste/`에 배치되며, 원칙을 우회하는 것이 아니라
경계를 명시하는 것이다.

**결론**: 설계가 새로 만든 위반은 없다. 착수 전 미해결 조건은 **테스트 러너 도입** 하나뿐이다.
