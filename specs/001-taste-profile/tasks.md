---
description: "Task list for 맞춤 취향 프로필 (마일스톤 1)"
---

# Tasks: 맞춤 취향 프로필

**Input**: Design documents from `specs/001-taste-profile/`

**Prerequisites**: [plan.md](./plan.md) · [spec.md](./spec.md) · [research.md](./research.md) · [data-model.md](./data-model.md) · [contracts/](./contracts/server-actions.md) · [quickstart.md](./quickstart.md)

**Tests**: 포함한다. constitution 원칙 II(테스트 우선)가 NON-NEGOTIABLE이므로 각 스토리는
실패하는 테스트를 먼저 만든 뒤 구현한다.

**Organization**: 사용자 스토리별로 묶어 각 스토리를 독립적으로 구현·검증할 수 있게 한다.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 병렬 실행 가능 (다른 파일, 미완료 의존 없음)
- **[Story]**: 해당 사용자 스토리 (US1~US4)

## Path Conventions

Next.js 단일 앱. 라우트는 `app/`, 도메인 로직은 `lib/`, 컴포넌트는 `components/`,
스키마는 `prisma/`, 테스트는 `tests/`. 상세는 plan.md의 Source Code 트리를 따른다.

> ⚠️ **Next.js 16**: Middleware가 **Proxy로 개칭**되었다. 루트의 `proxy.ts`에 `proxy` 이름으로
> export한다. `middleware.ts`를 만들지 않는다.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 테스트 수단 확보와 환경 준비. **T001~T003이 끝나기 전에는 어떤 기능 코드도 쓰지 않는다** — plan.md Complexity Tracking에서 constitution 원칙 II 게이트를 통과시킨 조건이다.

- [ ] T001 Vitest + React Testing Library 설치, `vitest.config.ts` 작성, `package.json`에 `test` 스크립트 추가
- [ ] T002 Playwright 설치, `playwright.config.ts` 작성, `package.json`에 `test:e2e` 스크립트 추가
- [ ] T003 러너가 실제로 실패를 보고하는지 확인 — `tests/unit/smoke.test.ts`와 `tests/e2e/smoke.spec.ts`에 의도적으로 실패하는 테스트를 넣고 `npm run test`·`npm run test:e2e`가 붉게 뜨는 것을 본 뒤 삭제한다. 초록만 보고 넘어가면 러너가 테스트를 아예 수집하지 못하는 상태를 놓친다
- [ ] T004 [P] `.gitignore`의 `.env*` 아래에 `!.env.example` 예외 추가 — 현재 패턴이 팀 공유용 예시 파일까지 무시한다
- [ ] T005 [P] `.env.example` 작성 — `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (값 없이 키만)
- [ ] T006 `.env.local`에 Supabase 프로젝트 실제 값 기입. **커밋하지 않는다**
- [ ] T007 [P] 런타임 의존성 설치 — `prisma`, `@prisma/client`, `@supabase/supabase-js`, `@supabase/ssr`, `zod`

**Checkpoint**: `npm run test`와 `npm run test:e2e`가 동작하고, `.env.local`로 Supabase에 연결 가능하다.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 모든 사용자 스토리가 딛고 서는 층. 완료 전에는 어떤 스토리도 시작할 수 없다.

- [ ] T008 `prisma/schema.prisma` 작성 — `TasteKind` enum과 `User`·`TasteProfile`·`Category`·`TasteItem` 4개 모델. data-model.md의 Prisma 스키마 초안을 따른다
- [ ] T009 최초 마이그레이션 생성·적용 — `npx prisma migrate dev --name init`
- [ ] T010 **C2 유니크 제약 raw SQL 마이그레이션** — `npx prisma migrate dev --create-only --name taste_item_unique_nulls_not_distinct` 후 생성된 SQL에 `UNIQUE NULLS NOT DISTINCT ("profileId", "kind", "categoryId", "detail")` 를 직접 넣고 적용. Prisma 스키마 문법으로 표현되지 않는다
- [ ] T011 T010 검증 테스트 `tests/integration/taste-item-unique.test.ts` — `detail`이 `NULL`인 동일 조합을 두 번 삽입해 **DB가 거부하는지** 확인. 이 제약이 빠지면 대분류만 지정한 항목이 무제한 중복되는데 화면상으로는 정상으로 보여 놓치기 쉽다 (quickstart V5-3)
- [ ] T012 [P] `prisma/seed.ts` 작성 — Category 30~50개를 TypeScript 상수 배열로, `upsert`로 멱등하게. `package.json`에 `prisma.seed` 설정 추가
- [ ] T013 `npx prisma db seed` 실행 후 Category 행 수 확인. **시드가 비면 US1이 통째로 막힌다**
- [ ] T014 [P] `lib/supabase/server.ts`, `lib/supabase/client.ts` — `@supabase/ssr` 기반 클라이언트 생성
- [ ] T015 [P] `lib/prisma.ts` — 개발 환경 hot reload에서 커넥션이 새지 않도록 싱글턴으로
- [ ] T016 `tests/unit/dal-session.test.ts` 작성 후 `lib/dal/session.ts`의 `verifySession()` 구현 — React `cache()`로 메모이즈, `User` 행이 없으면 생성(get-or-create, research R2)
- [ ] T017 `lib/dal/session.ts`에 `requireOnboarded()` 추가 — 온보딩 미완료 시 `/onboarding`으로 `redirect()`. **FR-018의 권위 있는 판정 지점**
- [ ] T018 [P] 루트에 `proxy.ts` 작성 — 세션 쿠키 존재 여부만 보고 미인증 요청을 `/login`으로. **DB를 조회하지 않는다** (Next.js 16 문서 지침, research R1)
- [ ] T019 [P] `tests/unit/validation-taste-item.test.ts` 작성 후 `lib/validation/taste-item.ts` 구현 — Zod 입력 스키마, 모순 검사(FR-010), 중복 검사(FR-011), **종류별 100건 상한 검사(FR-020)**
- [ ] T020 [P] `app/auth/callback/route.ts` — Supabase Auth 콜백 Route Handler
- [ ] T021 [P] `app/login/page.tsx` — 소셜 로그인 1종 진입 화면 (FR-019). `proxy.ts`와 DAL이 미인증 사용자를 여기로 보내므로, 이 화면이 없으면 리다이렉트가 404로 끝나고 **US1~US4의 E2E가 한 줄도 실행되지 않는다**
- [ ] T022 [P] `app/onboarding/error.tsx`, `app/taste/error.tsx` 배치 — 예상 못 한 예외 경계
- [ ] T023 ESLint `no-restricted-imports` 규칙 추가 (`eslint.config.mjs`) — `app/`과 `components/`에서 `@/lib/prisma` 직접 임포트 금지. M1에는 RLS라는 2차 방어선이 없어 DAL이 유일한 접근 제어 지점이므로, 규칙을 문서가 아니라 린터로 강제한다 (research R4)

**Checkpoint**: 스키마·시드·DAL·검증 로직이 서고 T011이 통과한다. 이제 스토리를 시작할 수 있다.

---

## Phase 3: User Story 1 - 잘못된 선물을 막을 근거를 남긴다 (Priority: P1) 🎯 MVP

**Goal**: 신규 사용자가 온보딩에서 `이미 있는 것`/`필요 없는 것`을 대분류로 등록하고, 취향 화면에서 종류별로 구분해 확인한다.

**Independent Test**: 신규 계정으로 `/onboarding` 진입 → 대분류 선택·저장 → `/taste`에서 두 종류가 다른 묶음으로 보인다. 다른 스토리 없이 완결된다.

### Tests for User Story 1 ⚠️ 구현보다 먼저

- [ ] T024 [P] [US1] `tests/e2e/onboarding.spec.ts` — spec.md US1 수용 시나리오 1~5를 그대로 옮긴다. **로그인부터 시작하며**(FR-019), 미완료 계정의 `/taste` 직접 접근이 `/onboarding`으로 유도되는지(FR-018) 포함
- [ ] T025 [P] [US1] `tests/integration/create-taste-item.test.ts` — `HAVE`/`UNWANTED` 저장 시 `onboardedAt`이 설정되는지, 모순·중복이 거부되는지, **상한 100건 초과가 거부되는지**(FR-020)

### Implementation for User Story 1

- [ ] T026 [US1] `lib/dal/taste.ts`에 `getCategories()` — `sortOrder` 순 평면 목록 (FR-005)
- [ ] T027 [US1] `app/taste/actions.ts`에 `createTasteItem` Server Action — contracts/server-actions.md의 검사 순서(세션 → 스키마 → 대분류 존재 → 모순 → 중복 → 저장)를 따른다. 유니크 위반 예외를 `DUPLICATE_ITEM`으로 변환해 경합을 닫는다. `verifySession()`은 통과하되 `requireOnboarded()`는 부르지 않는다 — 온보딩 화면에서 쓰이는 유일한 Action이다
- [ ] T028 [P] [US1] `components/taste/category-picker.tsx` (`'use client'`) — 대분류 선택과 검색 필터
- [ ] T029 [US1] `components/taste/taste-item-form.tsx` (`'use client'`) — `useActionState`로 폼 상태. 저장 실패 시 **입력 내용을 보존한다** (FR-016)
- [ ] T030 [US1] `app/onboarding/page.tsx` (Server Component) — 최소 1건 안내와 저장 후 `/taste` 이동
- [ ] T031 [US1] `lib/dal/taste.ts`에 `getTasteItemsByKind()`와 `getTasteProfile()` — 전자는 종류별로 묶인 형태로 반환해 화면이 그룹핑 로직을 갖지 않게 하고(FR-012), 후자는 프로필과 취향 서술을 반환한다. 두 함수 모두 인가를 통과한 결과만 내보내므로 호출부에 소유자 검사가 없다. `getTasteProfile()`은 US3의 T045(취향 서술 표시)가 사용한다
- [ ] T032 [US1] `components/taste/taste-item-list.tsx` (**Server Component**) — `이미 있는 것`과 `필요 없는 것`을 다른 묶음으로 렌더 (US1-3)
- [ ] T033 [US1] `app/taste/page.tsx` — 진입 시 `requireOnboarded()` 호출 (FR-018)
- [ ] T034 [US1] T024·T025를 초록으로 만들고 폭 360px에서 재확인

**Checkpoint**: US1이 독립적으로 동작한다. **여기까지가 MVP다.**

---

## Phase 4: User Story 2 - 원하는 것을 남긴다 (Priority: P2)

**Goal**: 사용자가 받고 싶은 선물을 `원하는 것`으로 등록한다.

**Independent Test**: `/taste`에서 `원하는 것`으로 대분류를 골라 저장 → `원하는 것` 묶음에 나타난다.

### Tests for User Story 2 ⚠️ 구현보다 먼저

- [ ] T035 [P] [US2] `tests/e2e/want-items.spec.ts` — spec.md US2 수용 시나리오 1~2. `원하는 것`이 0건이어도 온보딩 완료가 유지되는지 포함
- [ ] T036 [P] [US2] `tests/integration/create-taste-item.test.ts`에 케이스 추가 — `WANT` 저장이 `onboardedAt`에 **영향을 주지 않는지** (FR-008)

### Implementation for User Story 2

- [ ] T037 [US2] `app/taste/page.tsx`에 `원하는 것` 등록 진입점 추가 — T027의 Action을 `kind: 'WANT'`로 재사용한다. 새 Action을 만들지 않는다
- [ ] T038 [US2] `components/taste/taste-item-list.tsx`에 `원하는 것` 빈 상태 안내 추가 (US2-2)
- [ ] T039 [US2] T035·T036을 초록으로 만든다

**Checkpoint**: US1 + US2가 함께 동작한다.

---

## Phase 5: User Story 3 - 취향을 상세하게 만든다 (Priority: P3)

**Goal**: 대분류에 상세를 덧붙이고, 취향 서술을 자유 입력으로 남긴다. **PRD Risks R2가 겨냥하는 층이다.**

**Independent Test**: 기존 항목에 상세를 덧붙이고 취향 서술을 저장 → 둘 다 화면에 반영된다.

### Tests for User Story 3 ⚠️ 구현보다 먼저

- [ ] T040 [P] [US3] `tests/e2e/taste-detail.spec.ts` — spec.md US3 수용 시나리오 1~4. 상세를 비운 채 저장해도 정상 저장되는지(FR-006) 포함
- [ ] T041 [P] [US3] `tests/unit/validation-taste-item.test.ts`에 케이스 추가 — 취향 서술 빈 문자열이 `NULL`로 정규화되는지. FR-015 집계가 빈 문자열을 "작성함"으로 세지 않게 하는 장치다

### Implementation for User Story 3

- [ ] T042 [US3] `components/taste/taste-item-form.tsx`에 상세 입력 필드 추가 — **강제하지 않는다** (FR-006)
- [ ] T043 [US3] `app/taste/actions.ts`에 `updateTasteDescription` Server Action — 빈 문자열을 `NULL`로 정규화 (FR-007)
- [ ] T044 [P] [US3] `components/taste/description-editor.tsx` (`'use client'`) — 입력 상태와 저장 상태 표시
- [ ] T045 [US3] `app/taste/page.tsx`에 취향 서술 표시 영역 추가
- [ ] T046 [US3] T040·T041을 초록으로 만든다

**Checkpoint**: US1~US3가 함께 동작하고 상세·서술 데이터가 쌓이기 시작한다.

---

## Phase 6: User Story 4 - 남긴 취향을 고치고 지운다 (Priority: P4)

**Goal**: 등록한 취향 항목을 수정하거나 삭제한다.

**Independent Test**: 항목의 상세를 수정하고 다른 항목을 삭제 → 둘 다 반영된다. `이미 있는 것`/`필요 없는 것`이 1건뿐일 때 삭제하면 온보딩 미완료로 되돌아간다.

### Tests for User Story 4 ⚠️ 구현보다 먼저

- [ ] T047 [P] [US4] `tests/e2e/edit-delete.spec.ts` — spec.md US4 수용 시나리오 1~3. **마지막 `HAVE`/`UNWANTED` 삭제 시 온보딩 미완료 복귀**(US4-3)를 반드시 포함
- [ ] T048 [P] [US4] `tests/integration/ownership.test.ts` — 타인 소유 항목의 수정·삭제가 `FORBIDDEN`으로 거부되는지 (FR-002)

### Implementation for User Story 4

- [ ] T049 [US4] `app/taste/actions.ts`에 `updateTasteItem` Server Action — 소유자 검사 후 **수정 후 상태 기준으로** 모순·중복을 다시 검사한다. `kind`를 `WANT`로 바꿔 온보딩 조건이 깨지면 `onboardedAt`을 `NULL`로 되돌린다
- [ ] T050 [US4] `app/taste/actions.ts`에 `deleteTasteItem` Server Action — hard delete. 삭제 후 `HAVE`/`UNWANTED`가 0건이면 `onboardedAt`을 `NULL`로 되돌린다
- [ ] T051 [US4] `components/taste/taste-item-list.tsx`에 수정·삭제 진입점 추가 + **삭제 확인 다이얼로그를 `components/taste/delete-confirm-dialog.tsx`(`'use client'`)로 분리**. `taste-item-list.tsx`는 Server Component로 유지한다 — 확인 UI는 클라이언트 상태가 필요하므로 목록 전체를 클라이언트로 내리지 않고 다이얼로그만 떼어낸다. 확인은 클라이언트 책임이며 Action은 확인 없이 호출되면 그대로 지운다
- [ ] T052 [US4] T047·T048을 초록으로 만든다

**Checkpoint**: US1~US4 전부 동작한다.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T053 **FR-015 측정 검증** — research.md R7의 두 쿼리를 Supabase SQL 편집기에서 실행해 상세 작성률·취향 서술 작성률이 값으로 나오는지 확인 (quickstart V6). **이것이 통과해야 마일스톤 1이 끝난 것이다** — PRD Risks R2가 요구하는 "마일스톤 1 직후 즉시 측정"이 여기서 성립한다
- [ ] T054 [P] 폭 360px에서 quickstart V1~V4를 다시 밟는다. 가로 스크롤이 생기면 실패 (SC-006)
- [ ] T055 [P] FR-016 확인 — 저장 중 네트워크를 끊고 실패가 표시되며 **입력 내용이 남는지** (quickstart V5-4)
- [ ] T056 [P] 컴포넌트 크기 점검 — 500줄 초과가 있으면 하위 컴포넌트로 분해 (constitution 품질 게이트)
- [ ] T057 [P] `'use client'` 사용처 점검 — 폼·선택기·서술 편집기·삭제 확인 다이얼로그 **4개**로 한정되어 있는지. 목록 렌더가 Server Component로 남아 있는지 (constitution 원칙 III)
- [ ] T058 `npm run lint`와 `npm run build` 통과 — 완료 선언 전 필수 (constitution 품질 게이트)
- [ ] T059 quickstart.md V1~V7 전체를 순서대로 수동 검증
- [ ] T060 [P] SC-007 확인 — **구현에 참여하지 않은 외부 5명**(같은 수업 수강생 등)에게 취향 화면을 보여주고 `이미 있는 것`과 `필요 없는 것`을 구분할 수 있는지 묻는다. **4명 이상 성공**이 기준이며 결과를 숫자로 기록한다. 팀원은 평가자가 될 수 없다 — 만든 사람은 자기 화면을 항상 구분한다

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup) ──> Phase 2 (Foundational) ──> Phase 3 (US1) ──> Phase 4 (US2)
                                                                      │
                                              Phase 7 (Polish) <── Phase 6 (US4) <── Phase 5 (US3)
```

- **T001~T003이 절대 선행한다.** 테스트 러너 없이 기능 코드를 쓰면 plan.md가 constitution 원칙 II 게이트를 통과한 전제가 무너진다
- **T013(시드)이 US1보다 앞선다.** 대분류 목록이 비면 온보딩에서 고를 것이 없다
- **T010~T011이 US1보다 앞선다.** 제약 없이 구현하면 중복이 쌓이는데 화면상 정상으로 보여 나중에 발견된다

### User Story Dependencies

| 스토리 | 선행 | 비고 |
|---|---|---|
| US1 (P1) | Phase 2 | 독립. **MVP** |
| US2 (P2) | Phase 2 | US1의 `createTasteItem`을 재사용하므로 T027 이후가 효율적이나, 논리적으로는 독립 |
| US3 (P3) | Phase 2 | 붙일 항목이 있어야 의미가 있으므로 US1 이후 권장 |
| US4 (P4) | Phase 2 | 고칠 항목이 있어야 하므로 US1 이후 권장 |

### Within Each User Story

테스트 → DAL → Server Action → 클라이언트 컴포넌트 → 화면 → 초록 확인.

### Parallel Opportunities

- **Phase 1**: T004·T005·T007 동시
- **Phase 2**: T012·T014·T015·T018·T019·T020·T022 동시 (T008~T011 완료 후)
- **각 스토리**: 테스트 태스크끼리 동시 (T024+T025, T035+T036, T040+T041, T047+T048)
- **Phase 7**: T054·T055·T056·T057 동시

---

## Parallel Example: User Story 1

```
# US1의 테스트를 함께 작성 (구현 전)
T024 tests/e2e/onboarding.spec.ts
T025 tests/integration/create-taste-item.test.ts

# 구현 중 병렬 가능한 것
T028 components/taste/category-picker.tsx
```

---

## Implementation Strategy

### MVP First (User Story 1만)

Phase 1 → Phase 2 → Phase 3까지가 MVP다. 여기서 멈춰도 **이 제품이 기존 위시리스트 서비스와
갈리는 지점** — "이미 있는 것 / 필요 없는 것"을 남기는 기능 — 이 동작한다.

### Incremental Delivery

각 Phase 종료 시 checkpoint에서 동작을 확인하고 다음으로 넘어간다. US2~US4는 각각 독립된
증분이므로 시간이 부족하면 P4부터 잘라낸다. 다만 **US4(수정·삭제)를 자르면 오입력을 복구할
수 없어** 실사용 데이터의 신뢰도가 떨어진다 — 시연용으로만 자를 것.

### Parallel Team Strategy

Phase 2 완료 후 US1을 한 사람이 끝내면, US2~US4를 세 갈래로 나눌 수 있다. 다만 셋 다
`app/taste/actions.ts`와 `components/taste/taste-item-list.tsx`를 건드리므로 그 두 파일에서
충돌이 난다. 파일 단위로 나누려면 US3(서술)과 US4(수정·삭제)를 먼저 분리하는 편이 낫다.

---

## Notes

- `[P]`는 다른 파일을 건드리고 미완료 의존이 없을 때만 붙였다
- **DAL 우회 금지**: `lib/prisma.ts`를 `app/`이나 `components/`에서 직접 임포트하지 않는다.
  T023의 ESLint 규칙이 이를 강제한다. M1에는 RLS라는 2차 방어선이 없다
- **Next.js 16**: `middleware.ts`가 아니라 루트의 `proxy.ts`다
- 각 스토리 완료 후 커밋한다. Phase 7 전에 `npm run lint`·`npm run build`를 한 번 돌려두면
  마지막에 몰아서 고치는 일을 줄일 수 있다
