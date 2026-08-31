---
description: "Task list for 친구에게 취향이 전달된다 (마일스톤 2)"
---

# Tasks: 친구에게 취향이 전달된다 (마일스톤 2)

**Input**: Design documents from `/specs/002-friend-taste-sharing/`

**Prerequisites**: [plan.md](./plan.md) · [spec.md](./spec.md) · [research.md](./research.md) · [data-model.md](./data-model.md) · [contracts/](./contracts/server-actions.md) · [quickstart.md](./quickstart.md)

**Tests**: 포함한다. constitution 원칙 II(테스트 우선)가 NON-NEGOTIABLE이므로 각 스토리는
실패하는 테스트를 먼저 만든 뒤 구현한다.

**Organization**: 사용자 스토리별로 묶어 각 스토리를 독립적으로 구현·검증할 수 있게 한다.

## 시작 전에 — M1과 달라지는 것 3가지

| | 무엇 | 왜 |
|---|---|---|
| 1 | **E2E 테스트 계정이 2개 필요하다** | M2의 모든 시나리오가 "A가 링크를 만들고 B가 받는" 두 주체 구조다 (research R10) |
| 2 | **개발 서버는 `:3000` 고정** | `playwright.config.ts`의 `baseURL`·`webServer`가 3000이다 |
| 3 | **`app/i/`는 로그인 게이트 밖이다** | `proxy.ts` matcher가 화이트리스트라 넣지 않으면 자동 공개 (research R1) |

> ⚠️ **`skipped` 수를 확인한다.** 두 번째 계정이 비면 인증 E2E가 실패가 아니라 skip 된다.
> 초록으로 보이지만 한 줄도 안 돈다 — M1에서 이 skip이 픽스처 버그를 오래 가렸다.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 병렬 실행 가능 (다른 파일, 미완료 의존 없음)
- **[Story]**: 해당 사용자 스토리 (US1~US4)

## Path Conventions

Next.js 단일 앱. 라우트는 `app/`, 도메인 로직은 `lib/`, 컴포넌트는 `components/`,
스키마는 `prisma/`, 테스트는 `tests/`. 상세는 plan.md의 Source Code 트리를 따른다.

> ⚠️ **Next.js 16**: Middleware가 **Proxy로 개칭**되었다. 루트의 `proxy.ts`를 고친다.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: M2 검증에 필요한 두 번째 테스트 계정 준비

- [x] T001 `.env.example`에 `E2E_USER2_EMAIL`·`E2E_USER2_PASSWORD` 키와 두 번째 계정이 필요한 이유를 주석으로 추가
- [ ] T002 `.env.local`에 두 번째 테스트 계정 값 기입 — ⚠️ **팀원이 각자 자기 컴퓨터에서 수행한다.** Supabase → Authentication → Users → Add user → **Auto Confirm User 체크**. 커밋하지 않는다

**Checkpoint**: 두 계정으로 로그인이 되고 `.env.local`이 커밋 대상이 아니다

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 모든 스토리가 딛고 서는 스키마·제약·DAL·라우팅

**⚠️ CRITICAL**: 이 단계가 끝나기 전에는 어떤 스토리도 시작할 수 없다

- [X] T003 `prisma/schema.prisma`에 모델 3종(`Friendship`·`FriendInviteLink`·`Notification`)과 enum 2종(`FriendshipStatus`·`NotificationType`) 추가. **M1 모델은 건드리지 않는다** — `User`에 역참조 관계만 더한다
- [X] T004 `npx prisma migrate dev --name m2_friendship` 실행 → `prisma/migrations/` 에 마이그레이션 생성. **마이그레이션은 한 사람만 만든다**
- [X] T005 통합 테스트 작성 — `tests/integration/friendship-constraints.test.ts`. 같은 쌍을 순서 바꿔 두 번 넣으면 거부되는지(C3), 자기 자신과의 관계가 거부되는지(C4), `REMOVED` 행이 재추가를 막지 않는지. **지금은 실패해야 한다**
- [X] T006 C3 제약을 SQL로 직접 작성 — `npx prisma migrate dev --create-only --name friendship_pair_active` 후 `prisma/migrations/<ts>_friendship_pair_active/migration.sql` 에 `CREATE UNIQUE INDEX friendship_pair_active ON "Friendship" (LEAST(...), GREATEST(...)) WHERE status <> 'REMOVED'` 를 넣는다
- [X] T007 C4 제약을 SQL로 직접 작성 — `prisma/migrations/<ts>_friendship_not_self/migration.sql` 에 `ALTER TABLE "Friendship" ADD CONSTRAINT friendship_not_self CHECK ("requesterId" <> "addresseeId")`
- [X] T008 `tests/integration/friendship-constraints.test.ts`(T005)를 초록으로 만든다 — 제약이 실제로 걸렸는지가 여기서 판정된다
- [x] T009 [P] 단위 테스트 작성 — `tests/unit/invite-token.test.ts`. 토큰이 URL-safe인지, 매번 다른지, 길이가 일정한지
- [x] T010 [P] `lib/invite/token.ts` — 32바이트 랜덤을 base64url로. Node 표준 `crypto`만 쓴다 (research R2)
- [x] T011 [P] `lib/dal/session.ts`에 `getOptionalSession()` 추가 — 세션이 없으면 **`null`을 반환하고 redirect 하지 않는다** (research R3)
- [x] T012 [P] `proxy.ts`의 matcher에 `/friends/:path*`·`/notifications/:path*` 추가. **`/i/:path*`는 넣지 않는다** — 미리보기는 공개여야 한다 (FR-008)
- [ ] T013 [P] `app/friends/error.tsx`와 `app/notifications/error.tsx` 배치 — 예상 못 한 예외 경계
- [ ] T014 [P] `lib/dal/invite.ts`에 링크 유효성 판정 하나를 만든다 — `isValid(link) := revokedAt === null && expiresAt > now`. FR-004와 FR-007이 **같은 판정식**을 쓰므로 한 곳에 둔다
- [x] T015 [P] `app/friends/actions/shared.ts` — `ActionResult` 타입과 `guarded` 래퍼. **Action 파일 4개가 함께 쓰므로 기반 단계에서 먼저 만든다** (M1의 `lib/actions/call-action.ts` 패턴)

> 🚨 **T005~T008을 순서대로, 한 사람이.**
>
> PostgreSQL은 애플리케이션 검사만으로는 동시 요청에서 샌다. 두 사람이 서로의 링크를
> 동시에 열면 관계가 2행 생기고, **화면상으로는 완전히 정상으로 보인다.**
> M1의 T010(`NULLS NOT DISTINCT`)에서 같은 함정을 겪었다.
>
> **T005가 제약이 실제로 걸렸는지 확인하는 유일한 장치다.** T006·T007과 짝으로만 의미가 있다.

**Checkpoint**: 스키마가 서고 제약이 걸렸다. 모든 스토리를 시작할 수 있다

---

## Phase 3: User Story 1 - 링크로 친구가 된다 (Priority: P1) 🎯 MVP

**Goal**: 링크를 발급해 보내면 받은 사람이 승인 없이 바로 친구가 되고, 발급자에게 알림이 간다

**Independent Test**: 계정 두 개로 A가 링크를 발급해 B가 그 링크로 가입하면 서로의 친구 목록에
상대가 나타난다. 취향 열람 화면 없이도 검증된다

### Tests for User Story 1 ⚠️

> **먼저 쓴다. 실패하는 것을 확인한 뒤 구현한다**

- [x] T016 [P] [US1] E2E 테스트 — `tests/e2e/friend-invite.spec.ts`. spec.md US1 수용 시나리오 1~7. **로그인부터 시작하고 계정 2개를 쓴다**
- [x] T017 [P] [US1] E2E 인증 픽스처 확장 — `tests/e2e/fixtures/auth.ts`에 두 번째 계정 세션 주입 추가. env가 비면 skip 되는 기존 동작을 유지한다
- [ ] T018 [P] [US1] 통합 테스트 — `tests/integration/accept-invite.test.ts`. 성사 시 관계·`usedCount`·알림이 **한 트랜잭션**으로 함께 생기는지, 실패 시 함께 롤백되는지 (research R5)
- [ ] T019 [P] [US1] 통합 테스트 — `tests/integration/accept-invite-concurrent.test.ts`. 같은 링크를 동시에 여러 명이 써도 `usedCount`가 정확히 누적되고 관계가 중복 생성되지 않는지 (SC-008)

### Implementation for User Story 1

- [ ] T020 [US1] `lib/dal/invite.ts` — `getOrCreateActiveInviteLink()`. **유효한 링크가 있으면 새로 발급하지 않고 그것을 반환한다** (FR-004)
- [ ] T021 [US1] `lib/dal/invite.ts` — `getPreview(token)`. 유효하면 표시명·이미지·대표 태그, 무효면 `null`. **만료·중지·부재를 구분하지 않는다** (FR-007)
- [ ] T022 [US1] `lib/dal/friend.ts` — 대표 태그 추출. `WANT` 항목의 카테고리명 최근 등록순 최대 3건, 0건이면 빈 배열 (FR-012)
- [ ] T023 [US1] `app/friends/actions/accept-invite.ts` — `acceptInvite` Server Action. 검사 순서를 지킨다: 세션 → 토큰 유효성 → 본인 링크 → 기존 관계 → 트랜잭션(관계·`usedCount`·알림). **P2002를 `ALREADY_FRIENDS`로 바꾼다**
- [ ] T024 [P] [US1] `app/friends/invite/page.tsx` (SCR-M2-02) — 링크·만료 안내·복사·공유. **"받은 사람이 바로 친구가 됩니다"를 발급 시점에 고지한다** (FR-014)
- [ ] T025 [P] [US1] `components/friend/invite-link-card.tsx` (`'use client'`) — 클립보드 복사와 OS 공유 시트 호출
- [ ] T026 [P] [US1] `components/friend/invite-preview.tsx` (**Server Component**) — 표시명·이미지·대표 태그와 **가려진 항목의 이름 목록**(FR-010)
- [ ] T027 [US1] `app/i/[token]/page.tsx` (SCR-M2-04·05) — 세션 유무로 미리보기/성사를 가른다. 6가지 분기는 contracts의 표를 따른다. **`getOptionalSession()`을 쓴다 — `verifySession()`은 비가입자를 튕긴다**
- [ ] T028 [US1] `app/friends/page.tsx` (SCR-M2-01) — 친구 목록. **다가오는 일정 영역은 만들지 않는다** (clarify Q1)
- [ ] T029 [US1] `tests/e2e/friend-invite.spec.ts`·`tests/integration/accept-invite.test.ts`·`tests/integration/accept-invite-concurrent.test.ts`를 초록으로 만들고 `--project=mobile-360`으로 재확인

**Checkpoint**: 링크로 친구가 된다. **여기까지가 MVP다** — 취향 열람이 없어도 관계가 맺어지는 것을 시연할 수 있다

---

## Phase 4: User Story 2 - 친구의 취향을 본다 (Priority: P1)

**Goal**: 친구가 되면 상대의 취향 항목 전체와 취향 서술을 본다. 친구가 아니면 아무것도 못 본다

**Independent Test**: 이미 친구인 두 계정으로 한쪽이 상대의 취향 카드를 열어 M1에서 등록한
항목이 그대로 보이는지 확인한다. 링크 발급 흐름 없이 검증된다

### Tests for User Story 2 ⚠️

- [ ] T030 [P] [US2] E2E 테스트 — `tests/e2e/friend-taste.spec.ts`. spec.md US2 수용 시나리오 1~5. 취향이 비어 있는 친구의 카드가 오류 없이 성립하는지 포함 (SC-007)
- [ ] T031 [P] [US2] 통합 테스트 — `tests/integration/friend-access-control.test.ts`. **친구가 아닌 사용자의 취향 접근이 거부되는지**, 해제된 관계로는 열리지 않는지 (FR-022)

### Implementation for User Story 2

- [ ] T032 [US2] `lib/dal/friend.ts` — `requireActiveFriendship(friendUserId)`. 활성 관계가 없으면 접근 거부. **친구 데이터를 읽는 모든 경로의 유일한 관문** (constitution 데이터 보호)
- [ ] T033 [US2] `lib/dal/friend.ts` — `getFriendTaste(friendUserId)`. 내부에서 `requireActiveFriendship()`을 부른다. **M1의 `lib/dal/taste.ts`를 고치지 않는다** (research R8)
- [ ] T034 [US2] `lib/dal/friend.ts` — `getFriends()`. 친구 목록 + 각자 대표 태그를 **N+1 없이 한 번에** 모아 온다 (research R7)
- [ ] T035 [P] [US2] `components/friend/friend-list.tsx` (**Server Component**) — 친구 목록. 대표 태그가 0건이면 자리를 비운다. 친구 0명이면 링크로 시작하라는 안내
- [ ] T036 [P] [US2] `components/friend/friend-taste-card.tsx` (**Server Component**) — 세 종류 항목과 취향 서술을 필터 없이 전부 렌더 (FR-021)
- [ ] T037 [US2] `app/friends/[userId]/page.tsx` (SCR-M2-06) — 친구 상세. **`이 취향에 맞는 선물 보기` 버튼은 숨긴다** — 상품이 없어 빈 목록으로 연결된다
- [ ] T038 [US2] `tests/e2e/friend-taste.spec.ts`·`tests/integration/friend-access-control.test.ts`를 초록으로 만든다

**Checkpoint**: US1 + US2. **마일스톤 2의 완료 판정이 여기서 성립한다** — 링크 수신자가 상대 취향을 열람한다

---

## Phase 5: User Story 3 - 링크를 통제한다 (Priority: P2)

**Goal**: 발급자가 링크 사용 현황을 보고, 중지할 수 있고, 누가 친구가 됐는지 알림으로 안다

**Independent Test**: 링크를 발급해 사용 횟수를 확인하고 중지한 뒤 그 링크를 열면 아무것도
보이지 않는 것, 성사 알림이 남는 것까지 확인한다

### Tests for User Story 3 ⚠️

- [ ] T039 [P] [US3] E2E 테스트 — `tests/e2e/invite-control.spec.ts`. spec.md US3 수용 시나리오 1~8. **만료·중지·부재 셋이 같은 문구인지** 포함 (SC-005)
- [ ] T040 [P] [US3] 통합 테스트 — `tests/integration/notification.test.ts`. 성사 시 알림이 생기는지, 읽음 처리가 **이미 읽은 알림의 시각을 덮어쓰지 않는지**

### Implementation for User Story 3

- [ ] T041 [US3] `lib/dal/invite.ts` — `getMyInviteLinks()`. 사용 중 링크와 지난 링크를 나눠 반환
- [ ] T042 [US3] `app/friends/actions/invite-link.ts` — `revokeInviteLink` Server Action. 소유자 검사 후 `revokedAt` 기록
- [ ] T043 [US3] `lib/dal/notification.ts` — `getMyNotifications()`와 `getUnreadCount()`
- [ ] T044 [US3] `app/friends/actions/notification.ts` — `markNotificationRead`와 `markAllNotificationsRead`. 후자는 **읽지 않은 것만** 갱신한다
- [ ] T045 [P] [US3] `app/friends/invite/manage/page.tsx` (SCR-M2-03) — 사용 인원수와 만료까지 남은 기간, 중지 버튼
- [ ] T046 [P] [US3] `app/notifications/page.tsx` (SCR-M3-02) — 알림 목록. 알림 0건이면 빈 상태 안내 (FR-034)
- [ ] T047 [US3] `components/notification/notification-list.tsx` (`'use client'`) — 미읽음 구분, 읽음 처리 후 낙관적 갱신. 누르면 **그 친구의 취향 카드로 이동**한다 (FR-032)
- [ ] T048 [US3] `tests/e2e/invite-control.spec.ts`·`tests/integration/notification.test.ts`를 초록으로 만든다

> **T046·T047이 clarify Q4로 M2에 앞당겨진 것이다.** 도메인 모델 §11은 `Notification`을 M3
> 대상으로 두었으나, FR-017이 승인 절차를 없앤 대가로 남긴 통제 수단이라 M2에서 뺄 수 없다.
> **M2에서 쓰는 알림 종류는 친구 성사 하나뿐이다** — 나머지 10종을 미리 만들지 않는다.

**Checkpoint**: US1~US3. 승인 없는 링크의 통제 수단 셋(만료·중지·알림)이 전부 동작한다

---

## Phase 6: User Story 4 - 친구를 해제한다 (Priority: P3)

**Goal**: 관계를 끊으면 양방향으로 취향 접근이 차단되고, 이력은 남되 재추가를 막지 않는다

**Independent Test**: 친구인 두 계정에서 한쪽이 해제한 뒤 양쪽 모두 상대의 취향에 접근할 수
없는 것을 확인한다

### Tests for User Story 4 ⚠️

- [ ] T049 [P] [US4] E2E 테스트 — `tests/e2e/friend-remove.spec.ts`. spec.md US4 수용 시나리오 1~4. **해제 후 재추가가 되는지** 반드시 포함 (FR-026)
- [ ] T050 [P] [US4] 통합 테스트 — `tests/integration/friend-remove.test.ts`. 해제가 **양방향**인지, `removedBy`가 기록되는지, 과거 알림을 눌러도 접근이 거부되는지

### Implementation for User Story 4

- [ ] T051 [US4] `app/friends/actions/friendship.ts` — `removeFriend` Server Action. `status = REMOVED`, `removedAt`, `removedBy` 기록. **행을 지우지 않는다** (research R9)
- [ ] T052 [P] [US4] `components/friend/remove-friend-dialog.tsx` (`'use client'`) — 해제 확인. **"진행 중인 선물·펀딩은 그대로 진행됩니다" 문구를 넣지 않는다** — M2에는 거래가 없어 거짓말이 된다
- [ ] T053 [US4] `app/friends/[userId]/page.tsx`에 해제 진입점 추가. 목록과 카드는 Server Component로 유지하고 다이얼로그만 클라이언트로 뗀다
- [ ] T054 [US4] `tests/e2e/friend-remove.spec.ts`·`tests/integration/friend-remove.test.ts`를 초록으로 만든다

**Checkpoint**: US1~US4 전부 동작한다

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: 마일스톤 완료 판정

- [ ] T055 [P] 폭 360px에서 quickstart V1~V4를 다시 밟는다 — `npx playwright test --project=mobile-360`. **알림 목록을 포함한다** (SC-006)
- [X] T056 [P] 제약 확인 — `pg_indexes`에서 `friendship_pair_active`, `pg_constraint`에서 `friendship_not_self`가 조회되는지 (quickstart V5-1). **`db push`로 만든 DB에는 없다**
- [ ] T057 [P] `components/friend/`·`components/notification/`의 `'use client'` 사용처 점검 — 계획한 3개(`invite-link-card.tsx`·`remove-friend-dialog.tsx`·`notification-list.tsx`) 외에 붙은 것이 정당한지. `error.tsx`는 Next.js가 강제하므로 위반이 아니다
- [ ] T058 [P] `components/friend/`·`components/notification/`·`app/friends/` 컴포넌트 크기 점검 — 500줄 초과가 있으면 하위 컴포넌트로 분해 (constitution 품질 게이트)
- [ ] T059 `npm run lint`와 `npm run build` 통과 (constitution 품질 게이트)
- [ ] T060 quickstart.md V1~V6 전체를 순서대로 수동 검증. **`skipped` 수를 확인한다**
- [ ] T061 [P] SC-003 확인 — 링크를 발급한 사용자 5명에게 "받은 사람이 승인 없이 바로 친구가 되는 것을 알고 있었는지" 묻는다. **4명 이상**이 기준이며 결과를 숫자로 기록한다. 구현에 참여한 사람은 평가자가 될 수 없다

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 의존 없음
- **Foundational (Phase 2)**: Setup 이후. **모든 스토리를 막는다**
- **US1 (Phase 3)**: Foundational 이후
- **US2 (Phase 4)**: Foundational 이후. **US1과 독립** — 관계를 손으로 만들면 US1 없이 검증된다
- **US3 (Phase 5)**: Foundational 이후. 알림 검증에 US1의 성사 경로를 쓰는 편이 자연스럽다
- **US4 (Phase 6)**: Foundational 이후. 끊을 관계가 있어야 하므로 US1이 먼저면 편하다
- **Polish (Phase 7)**: 원하는 스토리가 전부 끝난 뒤

### 파일 충돌 지도

같은 파일을 두 스토리가 건드리는 지점이다. **M1에서 `app/taste/actions.ts`로 겪은 문제와 같다.**

**Server Action 파일을 나눠서 M1의 가장 큰 충돌원이 사라졌다.** 남은 것은 셋뿐이다.

| 파일 | 건드리는 스토리 | 해법 |
|---|---|---|
| `lib/dal/invite.ts` | Foundational(T014) · US1(T020·T021) · US3(T041) | **한 사람이 소유한다** — 남은 것 중 유일하게 셋이 겹친다 |
| `app/friends/[userId]/page.tsx` | US2(T037) · US4(T053) | US2를 먼저 끝낸다 |
| `app/friends/page.tsx` | US1(T028) · US2(T035 경유) | US1이 뼈대, US2가 목록 컴포넌트를 끼운다 |

> `app/friends/actions/` 는 파일 4개로 나뉘어 **US1·US3·US4가 서로 만나지 않는다.**
> `shared.ts` 만 기반 단계(T016)에서 먼저 만들고 그 뒤로는 아무도 고치지 않는다.

### Within Each User Story

- 테스트를 먼저 쓰고 **실패를 확인한 뒤** 구현한다
- DAL → Server Action → 화면 순서
- 스토리를 끝내고 다음 우선순위로 넘어간다

### Parallel Opportunities

- **Phase 2**: T009~T015 동시 (T003~T008 완료 후)
- **US1**: T016~T019 동시, 이후 T024~T026 동시
- **US2**: T030·T031 동시, 이후 T035·T036 동시
- **US3**: T039·T040 동시, 이후 T045·T046 동시
- **US4**: T049·T050 동시
- **Phase 7**: T055~T058 동시
- Foundational 이후 **US1과 US2를 두 사람이 나눠 동시 진행**할 수 있다

---

## Parallel Example: User Story 1

```bash
# 테스트를 함께 작성한다 (전부 다른 파일)
Task: "E2E 테스트 tests/e2e/friend-invite.spec.ts"
Task: "E2E 인증 픽스처 확장 tests/e2e/fixtures/auth.ts"
Task: "통합 테스트 tests/integration/accept-invite.test.ts"
Task: "통합 테스트 tests/integration/accept-invite-concurrent.test.ts"

# 구현 단계의 화면 3종도 함께 (전부 다른 파일)
Task: "app/friends/invite/page.tsx"
Task: "components/friend/invite-link-card.tsx"
Task: "components/friend/invite-preview.tsx"
```

---

## Implementation Strategy

### MVP First (US1만)

1. Phase 1 Setup
2. Phase 2 Foundational — **여기가 흔들리면 전부 다시 만진다**
3. Phase 3 US1
4. **멈추고 검증**: 계정 두 개로 링크 성사가 되는가
5. 시연 가능

### Incremental Delivery

1. Setup + Foundational → 기반 완성
2. US1 → 링크로 친구가 된다 (**MVP**)
3. US2 → 친구 취향을 본다 (**마일스톤 완료 판정**)
4. US3 → 링크 통제와 알림
5. US4 → 해제

### Parallel Team Strategy

Foundational이 끝나면:

- 개발자 A: US1 (링크·성사)
- 개발자 B: US2 (취향 열람·접근 제어)
- 그다음 US3·US4를 나눈다

단, **`lib/dal/invite.ts`는 한 사람이 쓴다.** Foundational·US1·US3가 전부 이 파일을 건드린다.
Server Action은 파일이 나뉘어 있으므로 스토리별로 각자 쓰면 된다.

---

## Notes

- `[P]` = 다른 파일, 미완료 의존 없음
- 각 태스크 또는 논리 묶음마다 커밋한다
- 체크포인트에서 멈춰 스토리를 독립적으로 검증할 수 있다
- **M1 스키마를 건드리지 않는다** — M2는 취향 데이터를 읽기만 한다
- 마이그레이션은 한 사람만 만든다. 여러 명이 만들면 팀 전원의 로컬 DB가 어긋난다
