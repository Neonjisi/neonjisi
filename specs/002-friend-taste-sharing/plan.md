# Implementation Plan: 친구에게 취향이 전달된다 (마일스톤 2)

**Branch**: `jisang/m2-spec` (스펙 디렉터리: `002-friend-taste-sharing`) | **Date**: 2026-08-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-friend-taste-sharing/spec.md`

## Summary

링크 하나로 친구가 되고, 친구가 되면 서로의 취향 전체를 본다. 승인 절차가 없는 대신
**만료 · 중지 · 발급자 알림** 셋이 통제 수단이다.

기술적으로는 M1이 세운 구조를 **그대로 잇는다.** 새 층을 만들지 않는다.

- 엔티티 3개 추가 (`Friendship` · `FriendInviteLink` · `Notification`). **M1 스키마는 건드리지 않는다**
- 접근 제어는 `lib/dal/friend.ts`의 함수 하나로 모은다 — M1의 `verifySession()`/`requireOnboarded()`와 같은 자리
- 관계 중복과 자기 참조는 **DB 제약으로 막는다.** M1의 T010(`NULLS NOT DISTINCT`)에서
  애플리케이션 검사만으로는 샌다는 것을 배웠다
- 미리보기 라우트 `/i/[token]`만 로그인 게이트 **밖**이다. `proxy.ts`의 matcher가
  화이트리스트라 목록에 넣지 않으면 자동으로 공개다

가장 신경 쓸 지점은 **성사 트랜잭션**이다. 관계 생성 · 사용 횟수 증가 · 발급자 알림이
한 트랜잭션이어야 하고, 동시 요청에서 유니크 위반을 정상 결과로 바꿔 처리해야 한다.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20+

**Primary Dependencies**: Next.js **16.3.2** (App Router), React 19.2.8, Tailwind CSS v4,
Prisma 7.10, `@supabase/supabase-js` + `@supabase/ssr`, Zod 4. **새 의존성 없음** —
토큰 생성은 Node 표준 `crypto`를 쓴다 (research R2)

**Storage**: Supabase PostgreSQL, Prisma로 접근. 팀 공용 프로젝트 1개

**Testing**: Vitest + React Testing Library(단위·통합), Playwright(E2E, `chromium` + `mobile-360`).
**E2E에 테스트 계정이 2개 필요하다** — M2의 모든 시나리오가 두 주체 구조다 (research R10)

**Target Platform**: 웹 브라우저. 모바일 기준 반응형

**Project Type**: web application — Next.js 단일 앱

**Performance Goals**: 링크를 처음 연 시점부터 3분 이내 친구 성사 + 취향 열람(SC-001).
링크 발급·복사·공유가 화면 하나 안에서 끝난다(SC-002)

**Constraints**: 폭 360px에서 가로 스크롤 없음(SC-006, 알림 목록 포함).
만료·중지·부재 링크의 응답이 외부에서 구분되지 않음(SC-005).
동시 사용 시 사용 횟수 정확 누적 · 관계 중복 생성 없음(SC-008)

**Scale/Scope**: 팀 과제 시연 규모. 화면 **8종** (친구 탭 · 링크 발급 · 링크 관리 ·
미리보기 · 성사 · 친구 상세 · 해제 확인 · **알림 목록**), 새 엔티티 3종.
알림 목록은 clarify Q4로 M3에서 앞당긴 것이다

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 원칙 | 판정 | 근거 |
|---|---|---|
| **I. 결정에는 근거가 붙는다** | ✅ Pass | research.md의 결정 10건 전부 Rationale과 기각한 대안을 함께 적었다. clarify 4문답은 spec.md의 `## Clarifications`에 질문·답변 형태로 남았다. 근거 없는 목표 수치를 쓰지 않았다 |
| **II. 테스트 우선 (NON-NEGOTIABLE)** | ✅ Pass | 각 스토리의 테스트 태스크를 구현 태스크보다 앞 번호에 둔다(tasks 단계). **DB 제약(C3·C4)과 그 검증 테스트를 짝으로 묶는다** — M1의 T010/T011 쌍과 같은 구조 |
| **III. Server Component가 기본이다** | ✅ Pass | `'use client'`를 **3개로 한정**한다 (링크 카드 · 해제 다이얼로그 · 알림 목록). 친구 목록·친구 상세·알림의 데이터 렌더는 서버에서 한다. 라우트는 전부 `app/` 아래 |
| **IV. 거래는 스냅샷으로 자립한다** | ✅ Pass (변형 적용) | M2에는 거래(`GiftRequest`·`Funding`)가 없다. 다만 **같은 논리를 `Notification.payload`에 적용**했다 — `friendDisplayName`을 발생 시점에 복사해 넣어, 해제된 친구의 알림을 볼 때 관계 없는 사용자를 조회하지 않는다 |
| **V. 연기는 후행 비용이 낮은 쪽으로** | ✅ Pass | `NotificationType` enum에 M3·M4의 10종을 미리 넣지 않는다 — enum 값 추가는 마이그레이션 한 줄이라 후행 비용이 낮다. 반면 `payload`는 지금 넣는다 — 나중에 넣으면 기존 행 전부의 기본값을 정해야 한다 (research R6) |
| **데이터 보호 — 단일 접근 규칙** | ✅ Pass | `requireActiveFriendship()` 하나에 모은다. **항목별 예외 분기 없음** — 친구면 전부, 아니면 전무(FR-021). M1의 `lib/dal/taste.ts`를 고쳐 쓰지 않고 친구 전용 함수를 새로 만든다 (research R8) |
| **데이터 보호 — 해제 시 즉시 차단** | ✅ Pass | 해제는 `status` 전이이고, 조회는 `status = 'ACTIVE'`만 본다. **해제된 관계를 되짚어 여는 예외 경로를 만들지 않는다** — M2에 진행 중 거래가 없어 예외 자체가 필요 없다 (research R9) |
| **데이터 보호 — 민감정보** | ✅ Pass | 취향은 민감정보다. 미리보기는 **취향 항목과 서술을 노출하지 않고**(FR-009) 표시명·이미지·대표 태그만 낸다. 무효 토큰은 표시명조차 내지 않는다(FR-011) |
| **품질 게이트** | ✅ Pass | `npm run lint` · `npm run build`를 완료 선언 전에 통과시킨다. 컴포넌트 500줄 초과 금지. `@/*` 절대 경로. `error.tsx` 경계 |

**위반 없음.** Complexity Tracking 표는 채우지 않는다.

### 한 가지 짚어둘 것 — 카드번호·`consent_version` 조항

constitution "데이터 보호"의 카드번호 미저장과 `consent_version` 조항은 **M2 범위에
해당 사항이 없다.** 결제와 동의 문구가 M3에서 등장한다. 지금 위반할 수 있는 것이 없다.

## Project Structure

### Documentation (this feature)

```text
specs/002-friend-taste-sharing/
├── plan.md              # 이 파일
├── spec.md              # /speckit-specify + /speckit-clarify 산출물
├── research.md          # Phase 0 — 결정 10건
├── data-model.md        # Phase 1 — 엔티티 3종 · 제약 C3·C4
├── quickstart.md        # Phase 1 — 검증 시나리오 V1~V6
├── contracts/
│   └── server-actions.md   # Phase 1 — DAL · Action · 라우트 계약
├── checklists/
│   └── requirements.md
└── tasks.md             # /speckit-tasks 산출물 — 아직 없음
```

### Source Code (repository root)

M1의 구조를 그대로 잇는다. **새 최상위 디렉터리를 만들지 않는다.**

```text
app/
├── friends/
│   ├── page.tsx                    # SCR-M2-01 친구 탭 (Server Component)
│   ├── error.tsx
│   ├── actions.ts                  # ★ 한 사람이 소유 — M1 의 taste/actions.ts 와 같은 이유
│   ├── invite/
│   │   ├── page.tsx                # SCR-M2-02 링크 발급·공유
│   │   └── manage/page.tsx         # SCR-M2-03 링크 관리
│   └── [userId]/page.tsx           # SCR-M2-06 친구 상세
├── notifications/
│   ├── page.tsx                    # SCR-M3-02 알림 목록 (M2 로 앞당김)
│   └── error.tsx
├── i/
│   └── [token]/page.tsx            # SCR-M2-04 미리보기 / SCR-M2-05 성사
│                                   #   ★ 로그인 게이트 밖 — proxy matcher 에 넣지 않는다
└── (M1: taste/ · onboarding/ · login/ · my/ · signup/ · auth/callback/)

components/
├── friend/
│   ├── friend-list.tsx             # Server Component
│   ├── friend-taste-card.tsx       # Server Component
│   ├── invite-link-card.tsx        # 'use client' — 복사·공유
│   ├── remove-friend-dialog.tsx    # 'use client' — 확인 다이얼로그
│   └── invite-preview.tsx          # Server Component
├── notification/
│   └── notification-list.tsx       # 'use client' — 읽음 처리 낙관적 갱신
└── (M1: taste/ · ui/)

lib/
├── dal/
│   ├── friend.ts                   # 신규 — requireActiveFriendship · getFriends · getFriendTaste
│   ├── invite.ts                   # 신규 — 링크 발급·조회·미리보기
│   ├── notification.ts             # 신규 — 알림 조회
│   ├── session.ts                  # getOptionalSession() 추가
│   └── taste.ts                    # ★ 변경하지 않는다
├── invite/
│   └── token.ts                    # 신규 — 32바이트 랜덤 base64url
└── (M1: actions/ · format/ · validation/ · prisma.ts · supabase/)

prisma/
├── schema.prisma                   # 모델 3종 · enum 2종 추가
└── migrations/
    ├── <ts>_m2_friendship/         # 모델 추가
    ├── <ts>_friendship_pair_active/    # raw SQL — partial unique index (C3)
    └── <ts>_friendship_not_self/       # raw SQL — CHECK (C4)

tests/
├── unit/          # 토큰 생성 · 링크 유효성 판정 · 대표 태그 추출
├── integration/   # C3·C4 제약 · 성사 트랜잭션 · 접근 제어 · 동시성
└── e2e/           # US1~US4. ★ 계정 2개 필요
```

**Structure Decision**: M1과 동일한 단일 Next.js 앱 구조를 유지한다. 라우트는 `app/`,
도메인 로직은 `lib/`, 컴포넌트는 `components/`. 프론트엔드/백엔드를 분리하지 않는다.

새로 생기는 규칙 두 개:

1. **`app/friends/actions.ts`를 한 사람이 소유한다.** M1에서 `app/taste/actions.ts`를
   한 사람이 쓰기로 해 US3↔US4 충돌을 없앤 것과 같다. M2는 US1·US3·US4가 모두 이 파일을 건드린다.
2. **`app/i/`는 앱 셸 밖이다.** 하단 탭도 로그인 게이트도 없다. 다른 라우트와 레이아웃을
   공유하지 않는다.

## Phase 0 — Research

**Output**: [research.md](./research.md) — 결정 10건, `NEEDS CLARIFICATION` 0건

| # | 결정 |
|---|---|
| R1 | 미리보기 주소는 `/i/[token]`, `proxy.ts` matcher에 넣지 않아 자동 공개 |
| R2 | 토큰은 32바이트 랜덤 base64url. 새 의존성 없음 |
| R3 | 미리보기와 성사를 한 라우트에서 세션 유무로 가른다 → `getOptionalSession()` 필요 |
| R4 | 관계 중복은 partial unique index로 DB가 막는다 (raw SQL) |
| R5 | `usedCount` 증가를 성사와 같은 트랜잭션에, `increment`로 |
| R6 | 알림은 M2에서 한 종류만. enum은 연기, `payload`는 지금 |
| R7 | 대표 태그 조회에 N+1 만들지 않기. 전환 기준을 숫자로 적어둠 |
| R8 | 접근 제어는 DAL 함수 하나로. **M1 함수를 고쳐 쓰지 않는다** |
| R9 | 해제는 상태 전이. M2에는 거래 예외가 없어 전면 차단 하나로 끝 |
| R10 | 테스트 3층 유지. **E2E 계정 2개**가 새로 필요 |

## Phase 1 — Design & Contracts

**Outputs**:
- [data-model.md](./data-model.md) — 엔티티 3종, 제약 C3(partial unique)·C4(CHECK), 상태 전이, 조회 규칙
- [contracts/server-actions.md](./contracts/server-actions.md) — DAL 4모듈, Server Action 5개,
  라우트 6개, `'use client'` 예산
- [quickstart.md](./quickstart.md) — 검증 시나리오 V1~V6

### Constitution Check 재평가 (Phase 1 이후)

설계를 마친 뒤 다시 봤다. **위반 없음.** 설계 과정에서 원칙이 실제로 작동한 지점 셋:

1. **원칙 III이 `getPreview()`의 형태를 정했다.** 미리보기를 클라이언트에서 토큰으로
   조회하게 만들면 무효 토큰 판정이 클라이언트에 노출된다. 서버에서 판정해 결과만 렌더한다.
2. **원칙 IV가 `Notification.payload`에 표시명을 복사하게 했다.** 조회 시점에 `User`를
   읽으면 해제된 친구의 알림에서 관계 없는 사용자를 조회하게 된다.
3. **원칙 V가 `NotificationType` enum의 범위를 정했다.** "나중에 10종을 넣는 비용"과
   "지금 `payload`를 안 넣는 비용"을 비교해 각각 연기·선반영으로 갈랐다.

### 남은 열린 항목

**없다.** spec.md에 남아 있던 마지막 열린 항목(미리보기 주소 체계)이 R1에서 닫혔다.

## Complexity Tracking

> Constitution Check에 위반이 없어 비워 둔다.
