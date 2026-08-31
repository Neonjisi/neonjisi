# Implementation Plan: 선물이 수령자 확인을 거쳐 결정된다 (마일스톤 3)

**Branch**: `gnuke-dev` (스펙 디렉터리: `003-gift-request-payment`) | **Date**: 2026-08-31 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-gift-request-payment/spec.md`

## Summary

주는 사람이 카탈로그에서 고르고, 수령자가 승인하거나 요청 금액 이하의 대안을 제시하고,
어느 경로든 확정 즉시 빌링키로 자동 결제된다. 거절 상태는 없다. 실패는 재시도로 복구된다.

기술적으로는 M2가 세운 구조를 **그대로 잇되, 돈이 걸린 두 층이 새로 생긴다.**

- 엔티티 5종 추가 (`Product` · `PaymentMethod` · `GiftRequest` · `Payment` · `Event`) +
  `NotificationType` 6종 확장 + `TasteItem.productId`. **M1·M2 스키마의 기존 필드는 건드리지 않는다**
- **PortOne은 인터페이스 하나 뒤에 숨긴다** (clarify Q1 혼합) — `lib/portone/client.ts`가
  mock·실연동을 같은 시그니처로 제공하고 `PORTONE_MODE`로 전환한다. E2E는 항상 mock
- **`PAYING` 조건부 UPDATE가 이 마일스톤의 단일 방어 지점이다** — 이것 없이는 더블탭·동시
  요청에서 중복 청구가 나고, 화면상 완전히 정상으로 보인다
- 만료는 cron 없이 **지연 평가** — 조회·응답이 지나는 전이 모듈(`lib/gift/state.ts`) 한 곳에서
  판정하고, 만료 확정 지점에서 `GIFT_EXPIRED` 알림을 만든다
- 금액·모순 불변식 4개는 **DB CHECK로 막는다** — M1 T010·M2 C3/C4에서 배운 그대로,
  애플리케이션 검사와 짝으로

가장 신경 쓸 지점은 **결제 실행 함수의 소유 경계**다. `chargeGiftRequest()`(D 소유)가
PortOne 호출 + `Payment` 기록 + 상태 확정 + 결제 알림까지 소유하고, 호출자(승인·대안·재시도)는
`PAYING` 잠금까지만 한다. 경계를 흐리면 알림 중복 발송과 상태 이중 확정이 난다.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20+

**Primary Dependencies**: Next.js **16.3.2** (App Router), React 19.2.8, Tailwind CSS v4,
Prisma 7.10 (+`@prisma/adapter-pg`), `@supabase/supabase-js` + `@supabase/ssr`, Zod 4.
**새 런타임 의존성 없음** — PortOne mock은 자체 구현, 빌링키 암호화는 Node 표준 `crypto`
(research R10). 실연동 전환 시 PortOne 브라우저 SDK는 스크립트 로드로 쓴다 (R1)

**Storage**: Supabase PostgreSQL, Prisma로 접근. 팀 공용 프로젝트 1개. 빌링키는 AES-256-GCM
암호화 컬럼 (R10)

**Testing**: Vitest + React Testing Library(단위·통합), Playwright(E2E, `chromium` + `mobile-360`).
E2E 계정 2개(M2의 `E2E_USER2_*` 재사용). **E2E는 항상 `PORTONE_MODE=mock`** (clarify Q1, R1)

**Target Platform**: 웹 브라우저. 모바일 기준 반응형

**Project Type**: web application — Next.js 단일 앱

**Performance Goals**: 승인 + 배송지 입력 후 추가 조작 0회로 결제 완료(SC-001).
동시·중복 응답에도 청구 정확히 1회(SC-002). 만료 판정 오차 없음 — 조회 즉시(SC-004)

**Constraints**: 폭 360px 가로 스크롤 없음, M3 화면 18종 전부(SC-010).
카드번호·CVC 무저장(SC-008). `unwanted` 3중 차단(SC-003). 동의 없는 요청 0건(SC-007).
TTL·재시도 값 전부 env — 하드코딩 금지 (도메인 모델 §9)

**Scale/Scope**: 팀 과제 시연 규모. 화면 **18종**(SCR-M3-01~18), 새 엔티티 5종 + enum 5종 +
`NotificationType` 6종 확장, Product 시드 30~50건

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 원칙 | 판정 | 근거 |
|---|---|---|
| **I. 결정에는 근거가 붙는다** | ✅ Pass | research.md의 결정 12건 전부 Rationale과 기각한 대안을 함께 적었다. clarify 4문답(Phase 0 결정 4건)은 spec.md `## Clarifications`에 남았다 |
| **II. 테스트 우선 (NON-NEGOTIABLE)** | ✅ Pass | 각 스토리의 테스트를 구현보다 앞 번호에 둔다(tasks 단계). **CHECK 4종(C5~C8)과 검증 테스트를 짝으로** — M1 T010/T011 · M2 C3/C4 쌍과 같은 구조. `PAYING` 동시성은 통합 테스트가 먼저다 |
| **III. Server Component가 기본이다** | ✅ Pass | `'use client'`를 **6개로 한정**한다 (contracts §5 예산표). 카탈로그 목록·요청 상세·내역의 데이터 렌더는 서버에서. 라우트는 전부 `app/` 아래 |
| **IV. 거래는 스냅샷으로 자립한다** | ✅ Pass | `GiftRequest`가 `productSnapshot` · `receiverDisplayName` · `shippingAddressSnapshot` · `respondDueAt`(절대 시각)을 생성·응답 시점에 복사한다. 진행·완료 화면은 스냅샷 필드만 읽는다 — `Product`·`User` 조인 렌더 금지 (R5) |
| **V. 연기는 후행 비용이 낮은 쪽으로** | ✅ Pass | funding 알림 4종·`Funding` 모델은 연기(enum 값·모델 추가는 싸다). 반면 `Payment.fundingContributionId` **컬럼**은 지금 선반영한다 — 빼면 C8(XOR CHECK)을 M4에서 다시 짜야 한다 (R4). 기본 배송지·추천 랭킹·검색 고도화는 연기 |
| **데이터 보호 — 단일 접근 규칙** | ✅ Pass | 친구 취향을 읽는 새 조회(대상 필터·매칭 배너·추천·친구 일정)는 전부 M2의 `requireActiveFriendship()`을 지난다. 우회 함수를 만들지 않는다 (R9) |
| **데이터 보호 — 해제 시 즉시 차단** | ✅ Pass | M3부터 "진행 중 거래 예외"가 실제로 생기지만, 예외 조회는 **거래 엔티티의 스냅샷을 읽는 것**으로 끝난다(원칙 IV). 해제된 관계를 되짚어 여는 경로는 없다 |
| **데이터 보호 — 카드번호·CVC** | ✅ Pass | 저장하지 않는다. PortOne(실연동 시)이 보관하고 이쪽은 빌링키만 AES-256-GCM 암호화로 보관(R10). 화면·로그에는 `cardBrand`·`cardLast4`만 |
| **데이터 보호 — `consent_version`** | ✅ Pass | 동의 문구는 `lib/gift/consent.ts` 코드 상수 + 버전 문자열(도메인 모델 §10). v1은 clarify Q4로 확정. 수정 시 버전 업이 리뷰 체크 항목이다 |
| **품질 게이트** | ✅ Pass | `npm run lint` · `npm run build` 통과 후 완료 선언. 컴포넌트 500줄 초과 금지. `@/*` 절대 경로. 라우트 4종에 `error.tsx` |

**위반 없음.** Complexity Tracking 표는 채우지 않는다.

## Project Structure

### Documentation (this feature)

```text
specs/003-gift-request-payment/
├── plan.md              # 이 파일
├── spec.md              # /speckit-specify + /speckit-clarify 산출물
├── research.md          # Phase 0 — 결정 12건
├── data-model.md        # Phase 1 — 엔티티 5종 · CHECK C5~C8 · 상태 전이
├── quickstart.md        # Phase 1 — 검증 시나리오 V1~V8
├── contracts/
│   └── server-actions.md   # Phase 1 — DAL · charge 경계 · Action · 라우트 계약
├── checklists/
│   └── requirements.md
└── tasks.md             # /speckit-tasks 산출물 — 아직 없음
```

### Source Code (repository root)

M2의 구조를 그대로 잇는다. **새 최상위 디렉터리를 만들지 않는다.**

```text
app/
├── page.tsx                        # SCR-M3-01 홈 개편 — 승인 대기·일정·(M4 펀딩 자리)
├── gifts/
│   ├── error.tsx
│   ├── actions/                    # ★ US끼리 같은 파일을 만지지 않게 먼저 나눈다
│   │   ├── shared.ts               #    ActionResult · guarded (M2 패턴 이식, 기반 단계)
│   │   ├── request.ts              #    US3 — createGiftRequest · cancelGiftRequest
│   │   ├── respond.ts              #    US4 — approveGift · counterGift
│   │   └── payment.ts              #    US5 — retryGiftPayment
│   ├── [id]/page.tsx               # SCR-M3-11 / SCR-M3-12 — 얇은 롤 분기 (giver/receiver)
│   ├── [id]/respond/reselect/page.tsx   # SCR-M3-13 대안 재선택
│   ├── [id]/respond/shipping/page.tsx   # SCR-M3-14 배송지
│   ├── [id]/result/page.tsx        # SCR-M3-15 결제 결과 3변형
│   ├── [id]/recover/page.tsx       # SCR-M3-16 결제 실패 복구
│   ├── new/page.tsx                # SCR-M3-08 요청 확인 (?productId=&receiverId=)
│   └── new/consent/page.tsx        # SCR-M3-09 재결제 동의 · new/done SCR-M3-10
├── products/
│   ├── page.tsx                    # SCR-M3-03 선물 탭 (검색·카테고리·대상 필터)
│   ├── error.tsx
│   ├── [id]/page.tsx               # SCR-M3-04 상품 상세 (매칭 배너 3상태)
│   └── for/[userId]/page.tsx       # SCR-M3-05 친구 맞춤 추천
├── payment-methods/
│   ├── page.tsx                    # SCR-M3-07 관리 · new/page.tsx SCR-M3-06 등록
│   ├── error.tsx
│   └── actions.ts                  # US2
├── events/
│   ├── page.tsx                    # SCR-M3-17 일정 등록·편집
│   ├── error.tsx
│   └── actions.ts                  # US6
├── my/gifts/page.tsx               # SCR-M3-18 선물 내역
└── (M1·M2: taste/ · friends/ · notifications/ · i/ · …)

components/
├── gift/
│   ├── countdown.tsx               # 'use client' — ★ 공용 카운트다운 하나 (6화면 재사용)
│   ├── receiver-respond.tsx        # 'use client' — SCR-M3-12 승인/대안 버튼
│   └── (giver-request-card 등 Server Component)
├── product/
│   └── product-card.tsx            # Server Component — 목록·재선택 재사용
├── payment/
│   └── billing-key-form.tsx        # 'use client' — SCR-M3-06 등록 폼 (mock/실 위젯)
├── event/
│   └── event-form-sheet.tsx        # 'use client' — 추가·편집 시트
└── notification/                   # M2의 목록에 gift 6종 문구·이동 추가

lib/
├── portone/
│   └── client.ts                   # 신규 — issueBillingKey · chargeBillingKey · refund
│                                   #   mock + PORTONE_MODE 스위치 (R1)
├── gift/
│   ├── state.ts                    # 신규 — 상태 전이 단일 모듈 + evaluateExpiry (R3·R6)
│   ├── charge.ts                   # 신규 — chargeGiftRequest() ★ 소유 경계 (R7)
│   └── consent.ts                  # 신규 — 동의 문구 상수 + CONSENT_VERSION
├── crypto/
│   └── billing-key.ts              # 신규 — AES-256-GCM 암호화/복호화 (R10)
├── dal/
│   ├── product.ts                  # 신규 — 목록·검색·대상 필터·추천·상한 필터
│   ├── gift.ts                     # 신규 — 보낸/받은 조회 · 홈 승인 대기 (전부 만료 평가 경유)
│   ├── payment-method.ts           # 신규 — 등록·조회·삭제
│   ├── payment.ts                  # 신규 — Payment 기록
│   ├── event.ts                    # 신규 — CRUD + 친구 일정 (requireActiveFriendship 경유)
│   └── (M1·M2: taste.ts · friendship.ts · invite*.ts · notification.ts · session.ts)
└── (M1·M2: actions/ · format/ · validation/ · prisma.ts · supabase/ · invite/)

prisma/
├── schema.prisma                   # 모델 5종 · enum 5종 · NotificationType 6종 · TasteItem.productId
├── seed.ts                         # Product 30~50건 추가 (시나리오 커버 4조건)
└── migrations/
    ├── <ts>_m3_gift/               # 모델 추가
    └── <ts>_m3_gift_checks/        # raw SQL — CHECK C5~C8

tests/
├── unit/          # 상태 전이 전수 · 만료 판정 · 암호화 왕복 · mock 결제 · 상한 필터
├── integration/   # CHECK 4종 · 생성 검증 순서 · PAYING 동시성 · 재시도 상한 · 만료 후 응답 거부
└── e2e/           # US1~US6. 계정 2개 · PORTONE_MODE=mock 고정
```

**Structure Decision**: M2와 동일한 단일 Next.js 앱. 새로 확정하는 규칙 셋:

1. **Server Action을 스토리별 파일로 나눈다** — M2 §2와 같은 이유. `app/gifts/actions/` 4파일 +
   `payment-methods`·`events` 각 1파일. US끼리 같은 파일을 만지지 않는다.
2. **결제가 등장하는 경로는 전부 `lib/portone/client.ts` 인터페이스를 지난다.** PortOne
   API를 직접 부르는 코드를 다른 파일에 두지 않는다 — 실·모의 전환이 한 곳에서 끝나야 한다.
3. **상태 전이는 `lib/gift/state.ts`만 안다.** 액션·DAL이 `status`를 직접 UPDATE 하지 않고
   전이 함수를 경유한다 — 도메인 모델 §5 "전이 함수 하나로 모아 검증한다".

## Phase 0 — Research

**Output**: [research.md](./research.md) — 결정 12건, `NEEDS CLARIFICATION` 0건

| # | 결정 |
|---|---|
| R1 | PortOne은 인터페이스 + mock 기본 + `PORTONE_MODE` 스위치. 실패 유도는 mock 카드 규약으로 |
| R2 | 중복 청구는 `PENDING → PAYING` 조건부 UPDATE(updateMany)로 막는다. 0행이면 중단 |
| R3 | 만료는 지연 평가 — `evaluateExpiry()` 한 곳, 모든 조회·응답이 경유. 알림도 그 지점에서 |
| R4 | CHECK 4종(C5~C8)은 raw SQL. `Payment.fundingContributionId`는 FK 없이 컬럼만 선반영 |
| R5 | 스냅샷 3+1종 — 생성 시 3종 + 응답 시 배송지. 화면은 스냅샷 필드만 읽는다 |
| R6 | 상태 전이 단일 모듈 — 허용 화살표 표. 직접 UPDATE 금지 |
| R7 | 알림 생성 경계 — `chargeGiftRequest()`가 상태 확정·`Payment`·결제 알림까지 소유 |
| R8 | 카운트다운은 공용 컴포넌트 하나 + 서버 시각 보정 |
| R9 | `unwanted` 3중 차단 — 목록 조인 · 상세 비활성 · 생성 검증. `have`는 표시만 |
| R10 | 빌링키는 사용자당 재사용, AES-256-GCM 앱 레벨 암호화. 새 의존성 없음 |
| R11 | 설정값 5종 전부 env — `GIFT_RESPOND_TTL` 등. 생성 시점 절대 시각 스냅샷 |
| R12 | 테스트 3층 유지. E2E는 mock 고정 + 계정 2개 + 미구현 화면은 probe skip(M2 T048 선례) |

## Phase 1 — Design & Contracts

**Outputs**:
- [data-model.md](./data-model.md) — 엔티티 5종, CHECK C5(counter 상한)·C6(counter 전무/전유)·
  C7(자기 자신)·C8(Payment XOR), 상태 전이, 조회 규칙, 마이그레이션 순서
- [contracts/server-actions.md](./contracts/server-actions.md) — PortOne 인터페이스,
  **`chargeGiftRequest()` 소유 경계**, DAL 5모듈, Server Action 7개, 라우트 12개,
  `'use client'` 예산
- [quickstart.md](./quickstart.md) — 검증 시나리오 V1~V8

### Constitution Check 재평가 (Phase 1 이후)

설계를 마친 뒤 다시 봤다. **위반 없음.** 설계 과정에서 원칙이 실제로 작동한 지점 셋:

1. **원칙 IV가 `[id]` 화면들의 데이터 소스를 정했다.** 요청 상세·결과·내역은 `GiftRequest`의
   스냅샷 필드만 읽는다. `Product`·`User` 조인으로 렌더하면 관계 해제·상품 변경 시 화면이
   깨진다 — 그래서 조인 렌더를 계약(contracts §4)으로 금지했다.
2. **원칙 V가 `fundingContributionId`의 선반영을 갈랐다.** 컬럼 없이 C8을 걸면 M4에서 CHECK를
   다시 만들어야 한다(후행 비용 높음 → 지금). FK와 funding 알림 4종은 M4로(후행 비용 낮음 → 연기).
3. **데이터 보호 조항이 결제 화면의 형태를 정했다.** 카드 입력이 앱 컴포넌트에 존재하지 않는다 —
   mock 모드조차 카드번호를 받지 않고 브랜드·뒷자리 4개만 고르게 했다(R1). 저장할 수 없으면
   유출할 수도 없다.

### 남은 열린 항목

**없다.** Phase 0 결정 4건이 전부 clarify에서 닫혔고(spec.md Clarifications),
연동 수준(P0-1)은 R1이 구현 형태로 옮겼다.

## Complexity Tracking

> Constitution Check에 위반이 없어 비워 둔다.
