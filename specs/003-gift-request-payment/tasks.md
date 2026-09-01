# Tasks: 선물이 수령자 확인을 거쳐 결정된다 (마일스톤 3)

**Input**: Design documents from `/specs/003-gift-request-payment/`

**Prerequisites**: plan.md · spec.md · research.md(R1~R12) · data-model.md(C5~C8) · contracts/server-actions.md · quickstart.md(V1~V8)

**Tests**: 포함한다 — constitution 원칙 II(테스트 우선)가 NON-NEGOTIABLE이다. 각 스토리에서
테스트 태스크가 구현보다 앞 번호다.

**Organization**: 스토리별로 묶는다. 팀 분담표(`docs/2026-08-31-m3-m4-team-assignment.md`)의
임시 번호(J·D·H·S)는 이 T번호로 재매핑해 `team-assignment.md`로 확정한다.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 병렬 가능 (다른 파일 · 미완 태스크에 의존 없음)
- 파일 경로는 저장소 루트 기준

---

## Phase 1: Setup

**Purpose**: 전원 각자의 환경 준비. M2 완료 상태(`origin/main`)에서 시작한다.

- [ ] T001 `.env.local`에 M3 env 추가 — `PORTONE_MODE=mock` · `BILLING_KEY_ENCRYPTION_KEY`(32바이트 base64) · `GIFT_RESPOND_TTL` · `GIFT_PAYMENT_RETRY_WINDOW` · `GIFT_PAYMENT_MAX_ATTEMPTS` (quickstart 전제 조건, 전원 각자, **커밋 금지**)
- [ ] T002 [P] Product 시드 콘텐츠 표 작성 — 30~50건, 시나리오 커버 4조건(want 일치·have·unwanted·싼 대안 다수) 충족 확인 (S 산출물, 마감: Phase 3 시작 전 — T008이 소비)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 모든 스토리가 딛는 층 — 스키마·CHECK·PortOne mock·상태 전이·charge 경계·공용 컴포넌트.

**⚠️ CRITICAL**: 이 Phase 완료 전에는 어떤 스토리도 시작할 수 없다. 특히 **T016~T017(charge)의
시그니처가 확정되기 전에는 US4(T046)를 시작할 수 없다** — M2의 T017과 같은 자리다.

### 스키마 (마이그레이션은 한 사람만 — M1·M2 규칙)

- [ ] T003 `prisma/schema.prisma` — `Product`·`PaymentMethod`·`GiftRequest`·`Payment`·`Event` 모델 + enum `GiftStatus`(**DECLINED 없음**)·`GiftResolution`·`PaymentStatus`·`PaymentMethodStatus`·`EventType` + `NotificationType`에 gift 6종 + `TasteItem.productId`(nullable FK) + `Payment.fundingContributionId`(컬럼만, FK 없음 — R4). 인덱스는 data-model.md 대로
- [ ] T004 마이그레이션 생성·적용 — `npx prisma migrate dev --name m3_gift` (`db push` 금지)
- [ ] T005 [P] 제약 검증 통합 테스트 **먼저(실패 확인)** — `tests/integration/gift-constraints.test.ts`: ① counter 초과 금액 삽입 ② counter 3필드 부분 NULL ③ Payment 양쪽 FK/무FK ④ giver=receiver (`friendship-constraints.test.ts` 템플릿)
- [ ] T006 raw SQL 마이그레이션 — `npx prisma migrate dev --create-only --name m3_gift_checks` → C5 `gift_counter_le_requested` · C6 `gift_counter_all_or_none` · C7 `gift_no_self` · C8 `payment_exactly_one_target` (SQL은 research R4 원문)
- [ ] T007 마이그레이션 적용 → T005 초록 확인
- [ ] T008 `prisma/seed.ts` 확장 — T002의 표로 Product 30~50건 주입 (기존 Category 시드 유지)

### 설정·암호화·PortOne

- [X] T009 [P] `lib/config/gift.ts` — env 설정값 읽기 헬퍼 (기본값 포함: TTL 5m · 24h · 3회 · mode=mock) (R11)
- [X] T010 [P] 단위 테스트 먼저 — `tests/unit/billing-key-crypto.test.ts`: 암호화 왕복 · 변조 시 복호화 실패
- [X] T011 [P] `lib/crypto/billing-key.ts` — AES-256-GCM `encryptBillingKey`/`decryptBillingKey` (R10) → T010 초록
- [X] T012 [P] 단위 테스트 먼저 — `tests/unit/portone-mock.test.ts`: mock 발급/결제 성공/실패(`0000` 규약)/타임아웃 정규화
- [X] T013 [P] `lib/portone/client.ts` — `PortOneClient` 인터페이스 + mock 구현 + `PORTONE_MODE` 스위치 (contracts §1) → T012 초록

### 상태 전이 · charge 경계 ★

- [ ] T014 [P] 단위 테스트 먼저 — `tests/unit/gift-state.test.ts`: 허용·금지 전이 전수 (R6 표) + `evaluateExpiry` 판정
- [ ] T015 [P] `lib/gift/state.ts` — 전이 함수 단일 모듈 + `evaluateExpiry()`(만료 확정 지점에서 `GIFT_EXPIRED` 알림 생성, 같은 트랜잭션 — R3) → T014 초록
- [X] T016 통합 테스트 먼저 — `tests/integration/gift-charge.test.ts`: 성공 시 PAID+Payment+양쪽 알림 / 실패 시 PAYMENT_FAILED+giver 알림 / 상한 초과 시 CANCELLED+`GIFT_CANCELLED_BY_PAYMENT`
- [X] T017 `lib/gift/charge.ts` — `chargeGiftRequest()` (contracts §2 소유 경계 전부) + `lib/dal/payment.ts` `recordPayment` → T016 초록. **이 시그니처 확정이 M3의 최우선 선행 태스크다**

### 공용 기반

- [X] T018 [P] `app/gifts/actions/shared.ts` — `ActionResult`·`guarded` (M2 `app/friends/actions/shared.ts` 이식) + `proxy.ts` matcher에 `/gifts`·`/products`·`/payment-methods`·`/events` 추가
- [ ] T019 [P] `app/gifts/error.tsx` · `app/products/error.tsx` · `app/payment-methods/error.tsx` · `app/events/error.tsx`
- [ ] T020 [P] `components/gift/countdown.tsx`(`'use client'`) — **공용 카운트다운 하나**, 서버 시각 보정 (R8). 5분 미만 `ink` · 1분 미만 `alarm` · 모션 금지
- [ ] T021 `lib/dal/gift.ts` — `getPendingRequestsForMe`·`getSentGifts`·`getReceivedGifts`·`getGiftRequest` — **전부 `evaluateExpiry()` 경유** (R3), View는 스냅샷 필드만 (R5)

**Checkpoint**: T005 초록(CHECK 실재) · T016 초록(mock 결제 왕복) · 시드 주입 완료 —
여기서부터 스토리 병렬 시작 가능

---

## Phase 3: User Story 1 - 상품을 탐색하면 어긋난 선물이 걸러진다 (Priority: P1) 🎯 MVP

**Goal**: 카탈로그 + `unwanted` 3중 차단의 앞 2중(목록·상세) + 맞춤 추천.

**Independent Test**: quickstart V1 — 취향 등록된 친구 계정 하나로 목록 필터·상세 차단·추천이
검증된다. 요청·결제 없이 성립.

### Tests for User Story 1

- [ ] T022 [P] [US1] E2E 먼저 — `tests/e2e/product-catalog.spec.ts`: 검색 / 대상 필터 / `unwanted` 상세 차단(검색 우회 포함) / 추천+제외 안내 / 매칭 배너 3상태 / 친구 아님 접근 거부

### Implementation for User Story 1

- [ ] T023 [US1] `lib/dal/product.ts` — `getProducts`(검색·카테고리·대상 필터)·`getProduct`·`getMatchBanner`·`getRecommendations`·**`getProductsUnderAmount`(상한 필터 — US4 T048이 재사용)** (contracts §3, 전부 `requireActiveFriendship` 경유 — R9)
- [ ] T024 [P] [US1] `components/product/product-card.tsx` 등 목록 컴포넌트 (Server Component — US4 재선택이 재사용)
- [ ] T025 [US1] `app/products/page.tsx` — SCR-M3-03 선물 탭 (대상 필터 0건 안내 포함)
- [ ] T026 [US1] `app/products/[id]/page.tsx` — SCR-M3-04 상품 상세 (배너 3상태 · `unwanted`면 선물하기 비활성 · `isActive=false` 차단)
- [ ] T027 [US1] `app/products/for/[userId]/page.tsx` — SCR-M3-05 맞춤 추천 (제외 안내 · want 0건 처리) + SCR-M2-06의 `이 취향에 맞는 선물 보기` 버튼 노출
- [ ] T028 [US1] T022 초록 (계정 2 · `skipped` 수 확인)

**Checkpoint**: US1 단독 시연 가능 — `unwanted` 2중 차단 + 추천

---

## Phase 4: User Story 2 - 결제수단을 등록한다 (Priority: P1)

**Goal**: mock 빌링키 발급·암호화 저장·관리 화면. 요청 플로우의 전제.

**Independent Test**: quickstart V2 — 등록 → 관리 표시 → 삭제 경고. 요청 없이 성립.

### Tests for User Story 2

- [X] T029 [P] [US2] E2E 먼저 — `tests/e2e/payment-method.spec.ts`: 등록(비저장 고지) / 진행 중 요청 경고 후 삭제 / 만료 표시

### Implementation for User Story 2

- [X] T030 [US2] `lib/dal/payment-method.ts` — `getMyPaymentMethods`·`getActivePaymentMethod`·`countActiveRequestsUsing` (빌링키는 View에 없음)
- [X] T031 [US2] `app/payment-methods/actions.ts` — `registerPaymentMethod`(T013 경유 발급 → T011 암호화 저장) · `deletePaymentMethod`(경고 카운트 반환)
- [X] T032 [US2] `components/payment/billing-key-form.tsx`(`'use client'`) + `app/payment-methods/new/page.tsx` — SCR-M3-06 (mock 카드 선택 폼 · "카드 정보는 넌지시에 저장되지 않습니다" · **강제 진입 시 복귀 경로**)
- [X] T033 [US2] `app/payment-methods/page.tsx` — SCR-M3-07 관리 + 마이 탭 만료 배지 + `components/payment/method-delete-dialog.tsx`
- [X] T034 [US2] T029 초록

**Checkpoint**: US1·US2 각각 독립 동작 — 빌링키 등록 완료

---

## Phase 5: User Story 3 - 선물 요청을 보낸다 (Priority: P1)

**Goal**: 검증 4종 → 별도 동의 화면 → 스냅샷 생성 → 수령자 알림 → 취소.

**Independent Test**: quickstart V3 — 계정 2개로 생성·도착·취소까지. 응답·결제 없이 성립.

### Tests for User Story 3

- [ ] T035 [P] [US3] 통합 테스트 먼저 — `tests/integration/gift-request.test.ts`: 검증 순서(동의→친구→결제수단→상품 unwanted→자기 자신) · 동의 없이 생성 불가 · 스냅샷 3종 기록 · `PENDING` 외 취소 거부
- [ ] T036 [P] [US3] E2E 먼저 — `tests/e2e/gift-request.spec.ts`: 상품→확인→동의(체크 전 비활성·금액 숫자)→전송→수령자 홈·알림 도착→취소 (계정 2)

### Implementation for User Story 3

- [ ] T037 [US3] `lib/gift/consent.ts` — clarify Q4 확정 문구 + `CONSENT_VERSION = '1'` (수정 시 버전 업 — 리뷰 체크 항목)
- [ ] T038 [US3] `app/gifts/actions/request.ts` — `createGiftRequest`(contracts §4 검사 순서 · 스냅샷 3종 · `GIFT_REQUEST_RECEIVED` 알림 트랜잭션) · `cancelGiftRequest`(`PENDING`에서만)
- [ ] T039 [US3] `app/gifts/new/page.tsx` — SCR-M3-08 요청 확인 (진입 차단 4종 · 결제수단 없으면 SCR-M3-06 강제 진입 후 복귀)
- [ ] T040 [US3] `components/gift/consent-checkbox.tsx`(`'use client'`) + `app/gifts/new/consent/page.tsx` — SCR-M3-09 별도 동의 화면 (08에 체크박스 금지)
- [ ] T041 [US3] `app/gifts/new/done/page.tsx` — SCR-M3-10 전송 완료 (T020 카운트다운)
- [ ] T042 [US3] `app/gifts/[id]/page.tsx` — **얇은 롤 분기**(giver/receiver — M2 `[userId]` 패턴) + giver 상세 SCR-M3-11 (상태 7변형 · 대안 대조 "차액 N원은 청구되지 않았습니다" · `PENDING`에서만 취소 버튼 · 스냅샷 필드만 렌더)
- [ ] T043 [US3] T035·T036 초록

**Checkpoint**: 요청 생성 → 동의 → 카운트다운 → 수령자 홈 도착까지 시연 가능

---

## Phase 6: User Story 4 - 수령자가 확인하고 결정한다 (Priority: P1)

**Goal**: 승인·대안 양쪽 경로 → `PAYING` 잠금 → charge 호출. **정확성 최대 위험 구간.**

**Independent Test**: quickstart V4·V5·V6 — 계정 2개로 승인/대안/만료/취소 후 응답.
결과 화면(T054)이 없으면 해당 단계 probe skip (R12).

### Tests for User Story 4

- [ ] T044 [P] [US4] E2E 먼저 — `tests/e2e/gift-respond.spec.ts`: 승인 경로 / 대안 경로(상한 필터·확정 전 고지) / 만료 후 응답 / 취소 후 응답 (계정 2 · 종착 화면 의존은 probe skip)
- [ ] T045 [P] [US4] 통합 테스트 먼저 — `tests/integration/gift-respond-concurrent.test.ts`: **동시 승인 2회 → 결제 1회** (R2) · counter 상한 거부 · 만료 후 응답 거부 (`accept-invite-concurrent.test.ts` 패턴)

### Implementation for User Story 4

- [ ] T046 [US4] `app/gifts/actions/respond.ts` — `approveGift`·`counterGift` (contracts §4 검사 순서: 만료 평가 → 상한 → 배송지 → **`PAYING` 조건부 UPDATE 잠금** → `GIFT_COUNTERED`(counter만) → `chargeGiftRequest()` 호출. **잠금 이후는 전부 T017 소유 — 상태·결제 알림에 손대지 않는다**)
- [ ] T047 [US4] `components/gift/receiver-respond.tsx`(`'use client'`) — SCR-M3-12 수신 뷰를 T042의 롤 분기에 얹는다 (**거절 버튼 없음** · 버튼 문구 "다른 것도 좋아요" — clarify Q3 · 상한 예고 보조 문구)
- [ ] T048 [US4] `app/gifts/[id]/respond/reselect/page.tsx` — SCR-M3-13 대안 재선택 (**T023의 `getProductsUnderAmount` + T024 카드 재사용** · 내 want 우선 · 상한 이하 0건 안내 · 확정 전 "알려집니다"+차액 미청구 고지)
- [ ] T049 [US4] `app/gifts/[id]/respond/shipping/page.tsx` — SCR-M3-14 배송지 (승인·대안 합류 · `shippingAddressSnapshot` · "이 주소는 이 선물에만 사용됩니다" · 처리 중 버튼 비활성)
- [ ] T050 [P] [US4] `components/friend/remove-friend-dialog.tsx`에 "진행 중인 선물은 그대로 진행됩니다" 추가 — M2에서 거짓이라 뺐던 문장이 M3에서 참이 된다
- [ ] T051 [US4] T044·T045 초록 — **동시성 테스트 통과가 Phase 6 완료 판정이다**

**Checkpoint**: 승인·대안 양쪽 경로로 확정(mock 결제) + 중복 청구 0건

---

## Phase 7: User Story 5 - 자동 결제가 실행되고 실패에서 복구된다 (Priority: P1)

**Goal**: 실패 → 재시도 → 성공 / 상한 초과 → 취소 + 양쪽 고지. **마일스톤 완료 판정.**

**Independent Test**: quickstart V7 — mock `0000` 카드로 실패를 만들고 복구·취소를 검증.

### Tests for User Story 5

- [X] T052 [P] [US5] 통합 테스트 먼저 — `tests/integration/gift-payment-retry.test.ts`: 실패→재시도→성공 / `GIFT_PAYMENT_MAX_ATTEMPTS` 초과→CANCELLED+**양쪽 알림** / `paymentRetryUntil` 초과 거부

### Implementation for User Story 5

- [X] T053 [US5] `app/gifts/actions/payment.ts` — `retryGiftPayment` (contracts §4: 재시도 가능 검사 → 수단 변경 → `PAYMENT_FAILED → PAYING` 재잠금 → `chargeGiftRequest()`)
- [X] T054 [P] [US5] `app/gifts/[id]/result/page.tsx` — SCR-M3-15 결제 결과 3변형 (paid / expired — 수령자 탓하지 않는 문구 / cancelled — "민수님께 별도로 연락해보세요"). **T044 승인 E2E의 종착 화면 — Phase 6과 병행으로 먼저 만들 수 있다** (분담표 D14)
- [X] T055 [US5] `app/gifts/[id]/recover/page.tsx` — SCR-M3-16 실패 복구 (시도 횟수·기한 · giver 전용 — 수령자에게 실패 진행 비노출)
- [X] T056 [P] [US5] 알림 목록 확장 — gift 6종의 표시 문구·탭 이동 매핑 (`components/notification/` — M2 파일)
- [X] T057 [US5] T052 초록 + E2E — `tests/e2e/gift-payment-recovery.spec.ts`: `0000` 카드 실패 → 수단 변경 재시도 → 성공
- [X] T058 [US5] (P0-1 실연동 확장 시점) `lib/portone/client.ts`에 실연동 구현 추가 — `PORTONE_MODE=real` 스모크. 실키는 `.env.local`에만, E2E는 여전히 mock (스모크: `npx tsx scripts/portone-smoke.ts` — 2026-09-01 인증 통과 확인)

**Checkpoint**: **마일스톤 3 완료 판정** — 양쪽 경로 자동 결제 + 실패 → 재시도 복구

---

## Phase 8: User Story 6 - 홈이 액션 허브가 되고 일정·내역이 모인다 (Priority: P2)

**Goal**: 홈 개편(승인 대기 최상단) · 일정 · 내역 · 앱 셸 전환. Phase 6~7과 병행 가능.

**Independent Test**: quickstart V8 — 승인 대기·일정 데이터를 만든 상태로 홈·일정·내역 검증.

### Tests for User Story 6

- [ ] T059 [P] [US6] E2E 먼저 — `tests/e2e/home-hub.spec.ts`: 승인 대기 최상단·임박순 1건 펼침 / 카운트다운 0 → 카드 만료 전환 / 일정 노출 / 내역 탭·라벨

### Implementation for User Story 6

- [ ] T060 [US6] `lib/dal/event.ts` + `app/events/actions.ts` — CRUD + `getUpcomingEvents`(본인+**활성 친구**, `requireActiveFriendship` 경유 · `isRecurring` 월·일 매칭)
- [ ] T061 [US6] `app/events/page.tsx` + `components/event/event-form-sheet.tsx`(`'use client'`) — SCR-M3-17 목록형 (clarify Q2) · "친구에게 이 일정이 보입니다"
- [ ] T062 [US6] `app/page.tsx` 홈 개편 — SCR-M3-01 (승인 대기 **최상단** 임박순 · 다건 1건 펼침+접기 · 일정 섹션 · 펀딩 섹션은 M4까지 숨김 · T020 카운트다운) + **앱 셸 전환**: 선물 탭 활성 · 시작 화면 홈으로 (화면 명세 §12)
- [ ] T063 [P] [US6] SCR-M2-01 친구 탭 일정 섹션 활성화 — M2 T028 보류분
- [ ] T064 [US6] `app/my/gifts/page.tsx` — SCR-M3-18 선물 내역 (보낸/받은 · 진행 중/지난 · 변경 라벨 · 스냅샷 렌더) + 마이 탭 메뉴 노출(선물 내역·결제수단) + SCR-M1-09 위시리스트 `( 카탈로그에서 고르기 )` 진입점(`TasteItem.productId` 연결, 텍스트 경로 유지)
- [ ] T065 [US6] T059 초록

**Checkpoint**: 홈이 액션 허브다 — 전 스토리 통합 시연 경로 성립

---

## Phase 9: Polish & Cross-Cutting Concerns

- [ ] T066 [P] 제약 확인 — `pg_constraint`에서 CHECK 4종 조회 (quickstart SQL, M2 T056 패턴)
- [ ] T067 [P] 360px 검증 — `playwright.config.ts`의 `mobile-360` 프로젝트에 M3 화면 추가 후 전 E2E 통과 (SC-010)
- [ ] T068 [P] `'use client'` 예산 점검(6개 — contracts §6) + 컴포넌트 500줄 점검 + 스냅샷 외 조인 렌더 없는지 점검 (R5)
- [ ] T069 quickstart V1~V8 수동 검증 (계정 2) + **`skipped` 수 확인** + 승인률 쿼리 실행 (S 주도)
- [ ] T070 `npm run lint` · `npm run build` 통과 → main 병합

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 → Phase 2 → 스토리들(3~8) → Phase 9**
- **T017(charge 시그니처)이 T046(US4)을 막는다** — M3의 최우선 선행 태스크 (contracts §2)
- T008(시드)이 T022(US1 E2E)를 막는다 — 상품 없이는 카탈로그 E2E가 못 돈다
- T023(상한 필터)·T024(카드)가 T048(재선택)을, T042(롤 분기)가 T047(수신 뷰)을 막는다
- T054(결과 화면)는 T044(승인 E2E)의 종착 — **Phase 6과 병행으로 먼저** 만들 수 있다 [P]

### User Story Dependencies

- **US1·US2**: Foundational 후 서로 독립 — 병행 가능
- **US3**: US1(상품 존재)·US2(활성 결제수단) 산출물 필요. 단 테스트 픽스처로는 시드·DAL 직접
  생성이 가능해 서버 구현은 병행 시작 가능
- **US4**: US3의 요청 + T017 시그니처. 화면 일부(T047·T048)는 US1·US3 산출물 재사용
- **US5**: US4의 확정 경로. T054·T056은 병행 선행 가능
- **US6**: Foundational(T021)만 있으면 시작 가능 — Phase 6~7과 병행

### Parallel Opportunities

- Phase 2 안: T005·T009~T015·T018~T020 이 [P] — 스키마(T003~T004)와 병렬
- Foundational 후: **US1(H) ∥ US2(D) ∥ US3 서버(J)** 가 대표적 3병렬
- Phase 6~7 중: **US6(H) ∥ US4(J) ∥ T054·T056(D)** 병행

## Parallel Example: Foundational

```bash
# 스키마 적용(T004) 후 동시 착수:
Task: "T005 gift-constraints.test.ts (실패 확인)"
Task: "T010+T011 billing-key 암호화"
Task: "T012+T013 portone mock"
Task: "T014+T015 gift state 전이"
Task: "T018 shared.ts + proxy matcher"
Task: "T020 countdown 공용 컴포넌트"
```

## Implementation Strategy

- **MVP = Phase 1~3 (US1)**: 카탈로그와 `unwanted` 차단만으로도 제품 핵심 가치가 시연된다
- **완료 판정 = Phase 7 (US5)**: "승인·대안 양쪽 경로 자동 결제 + 실패 → 재시도 복구"
- 증분 순서: US1 → US2 → US3 → US4 → US5 → US6 (US6는 6~7과 병행 가능)
- 팀 병렬 전략은 `docs/2026-08-31-m3-m4-team-assignment.md`의 Phase 배치를 따르고,
  임시 번호 ↔ T번호 매핑은 `team-assignment.md`(확정본)에서 관리한다

## Notes

- 테스트 태스크는 반드시 **실패를 먼저 확인**한다 (constitution 원칙 II)
- 마이그레이션(T003~T007)은 한 사람만 만든다 · `db push` 금지
- E2E·통합 테스트는 항상 `PORTONE_MODE=mock` — 실키로 테스트 금지 (협업 규칙)
- 동의 문구를 고치면 반드시 `CONSENT_VERSION`을 올린다 — 리뷰 체크 항목
- `evaluateExpiry()`를 경유하지 않는 gift 조회 함수 금지 — 리뷰 체크 항목
