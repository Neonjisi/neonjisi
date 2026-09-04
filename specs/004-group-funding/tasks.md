# Tasks: 고가 선물을 여럿이 함께 준비한다 (마일스톤 4)

**Input**: Design documents from `/specs/004-group-funding/`

**Prerequisites**: plan.md · spec.md · research.md(R1~R8) · data-model.md(C9·C10) · contracts/server-actions.md · quickstart.md(V1~V6)

**Tests**: 포함한다 — constitution 원칙 II(테스트 우선). 각 스토리에서 테스트가 구현보다 앞 번호다.

**Organization**: 스토리별. **착수 전제: M3 완료** — 상품·빌링키·portone mock(`refund` 포함)·
알림 인프라가 main에 있어야 한다. M4의 T번호는 M3와 독립된 번호 공간이다(문서 간 참조 시
`M4-T001`처럼 구분).

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [ ] T001 `.env.local`에 M4 env 추가 — `E2E_USER5_EMAIL`/`E2E_USER5_PASSWORD`(Supabase Add user · Auto Confirm) + `FUNDING_RESERVATION_TTL=5m` (전원 각자, **커밋 금지**, `skipped` 함정 주의)
- [ ] T002 [P] 문구 세트 확정 — 고지 2종("공개됩니다"·"환불됩니다") · 차액 동의 v1(최대 부담액 숫자 템플릿, `FUNDING_CONSENT_VERSION` 시작점) · `FAILED`/`CANCELLED` 구분 문구 · 환불 안내("영업일 3~5일" 고정 — clarify Q4) (S 산출물, 마감: 각 화면 구현 전)
- [x] T003 [P] E2E 픽스처 3계정 확장 — `tests/e2e/fixtures/auth.ts`에 세 번째 계정 세션 주입 (M2 T017 방식. **3주체 E2E 전부를 막는 선행 태스크**)

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: T013~T014(settle)의 시그니처 확정 전에는 US2·US3을 시작할 수 없다 —
M3의 T017(charge)과 같은 자리.

### 스키마 (마이그레이션은 J만 — M1~M3 규칙)

- [x] T004 `prisma/schema.prisma` — `Funding`·`FundingContribution` + enum `FundingStatus`·`ContributionStatus` + `NotificationType` funding 4종 + `Payment.fundingContributionId` FK. 인덱스는 data-model.md 대로
- [x] T005 마이그레이션 — `npx prisma migrate dev --name m4_funding` (`db push` 금지)
- [x] T006 [P] 제약 검증 통합 테스트 **먼저(실패 확인)** — `tests/integration/funding-constraints.test.ts`: ① `minAmount > goalAmount` 삽입 ② 개설자=수령자인데 `min ≠ goal` ③ Payment FK 무결성
- [x] T007 raw SQL — `--create-only`로 C9 `funding_min_le_goal` · C10 `funding_self_full_goal` · `payment_funding_contribution_fk` (SQL은 research R4 원문)
- [x] T008 적용 → T006 초록

### 총액 · 상태 · 정산 ★

- [x] T009 [P] 단위 테스트 먼저 — `tests/unit/funding-totals.test.ts`: `paidTotal`은 `PAID`만 / `capTotal`은 `RESERVED`+`PAID` — 섞이면 실패하는 케이스 포함
- [x] T010 [P] `lib/funding/totals.ts` — 총액 단일 모듈 (R3) → T009 초록
- [x] T011 [P] 단위 테스트 먼저 — `tests/unit/funding-state.test.ts`: 허용·금지 전이 전수 + 예약 만료 판정
- [x] T012 [P] `lib/funding/state.ts` — 전이 함수 + `evaluateReservationExpiry()`(지연 해제 — R2) → T011 초록
- [x] T013 통합 테스트 먼저 — `tests/integration/funding-settle.test.ts`: 성사(마감·조기) / 미달 → 전 PAID 환불 + 알림 / 취소 → 환불 + 구분 문구 / 차액 topup + `FUNDING_ORGANIZER_TOPUP` / **동시 정산 2회 → 실행 1회**(멱등 잠금) / topup 실패 → 재시도 → 상한 초과 CANCELLED
- [x] T014 `lib/funding/settle.ts` — `settleFunding()` (contracts §2 소유 경계 전부: 판정 잠금 → 환불(refund 첫 실사용) → 차액(chargeBillingKey) → SETTLED → 알림 3종) → T013 초록. **M4 최우선 선행 태스크**

### 공용 기반

- [x] T015 [P] `app/fundings/actions/shared.ts`(M3 이식) + `proxy.ts` matcher `/fundings/:path*` + `app/fundings/error.tsx`
- [x] T016 `lib/dal/funding.ts` — `getFunding`(canViewFunding + **지분 3단계 마스킹**) · `getMyFundings` · `getHomeFundings` — **모든 조회가 정산 트리거(R1)·예약 만료 해제(R2) 경유**

**Checkpoint**: T006 초록(CHECK·FK 실재) · T013 초록(정산 왕복·멱등) — 스토리 착수 가능

---

## Phase 3: User Story 1 - 펀딩을 연다 (Priority: P1) 🎯 MVP

**Goal**: 두 분기(나에게 2스텝 / 친구에게 3스텝 + 차액 동의) 개설.

**Independent Test**: quickstart V1 — 참여 없이 개설·저장 값 검증.

- [x] T017 [P] [US1] E2E 먼저 — `tests/e2e/funding-create.spec.ts`: 친구에게 3스텝(차액 동의 숫자·체크 전 비활성) / 나에게 2스텝(달성선 잠금) / 금액·마감 검증 오류
- [x] T018 [US1] `lib/funding/consent.ts` — 차액 동의 문구(T002 확정분) + `FUNDING_CONSENT_VERSION = '1'` (M3 gift 동의와 **독립 버전**)
- [x] T019 [US1] `app/fundings/actions/create.ts` — `createFunding` (contracts §4 검사 순서 · 스냅샷 2종 · 개설자=수령자면 `min := goal` 강제)
- [x] T020 [US1] `components/funding/create-form.tsx`(`'use client'`) + `app/fundings/new/page.tsx` — SCR-M4-01~03 (달성선 **잠금이지 숨김 아님** · 최대 부담액 숫자 · 결제수단 없으면 SCR-M3-06 강제 진입 복귀)
- [x] T021 [P] [US1] SCR-M3-04 상품 상세의 `( 여럿이 모아서 선물하기 )` 진입점 활성화
- [x] T022 [US1] T017 초록

**Checkpoint**: 두 분기 개설 시연 가능 — R3(PRD) 해소가 화면으로 보인다

---

## Phase 4: User Story 2 - 선결제로 참여한다 (Priority: P1)

**Goal**: 상세(두 총액 표기·지분 뷰) + 2단계 예약 참여. **동시성 최대 위험 구간.**

**Independent Test**: quickstart V2·V3 — 3계정으로 참여·캡·지분 뷰 검증.

- [x] T023 [P] [US2] E2E 먼저 — `tests/e2e/funding-contribute.spec.ts`: 상세 게이지·남은 금액·"결제 중 N원" / 참여 성공 + 주최자 알림 / 잔여 초과 거부 / **지분 3단계 뷰** / 비친구 접근 거부 (**3계정**)
- [x] T024 [P] [US2] 통합 테스트 먼저 — `tests/integration/funding-cap-concurrent.test.ts`: **동시 참여 2건 → 합계 ≤ 목표** (FOR UPDATE) / 예약 만료 지연 해제 / 결제 실패 → 예약 해제 / 추가 참여 허용 · RESERVED 취소
- [x] T025 [US2] `app/fundings/actions/contribute.ts` — `contributeToFunding` (contracts §4 2단계: FOR UPDATE 예약 → 결제 → 확정/해제 + `FUNDING_CONTRIBUTION_RECEIVED` + **조기 성사 시 `settleFunding()` 즉시 호출**) · `cancelReservation`
- [x] T026 [US2] `app/fundings/[id]/page.tsx` — SCR-M4-04 상세 (상태 7변형 · 진행바=paid·남은=cap · 게이지 CSS 400ms 1회 · 주최자 취소 메뉴 · `share-button`)
- [x] T027 [US2] `components/funding/contribute-form.tsx` + `app/fundings/[id]/contribute/page.tsx` — SCR-M4-05 (**고지 2종 나란히** · 빠른 칩 "전액" · 잔여 검증)
- [x] T028 [US2] SCR-M4-06 참여 결과 3변형 (처리 중 / 완료 / 실패 — 예약 해제 안내)
- [x] T029 [US2] T023·T024 초록 — **캡 동시성 통과가 Phase 4 완료 판정**

**Checkpoint**: 3계정 참여 시연 + 목표 초과 0건

---

## Phase 5: User Story 3 - 정산이 돈을 정리한다 (Priority: P1)

**Goal**: 마감 → 첫 조회 정산 → 성사·차액 / 미달·취소 환불. **마일스톤 완료 판정.**

**Independent Test**: quickstart V4·V5 — 마감을 과거로 만들어 네 갈래 검증.

- [x] T030 [P] [US3] E2E 먼저 — `tests/e2e/funding-settle.spec.ts`: 마감 후 조회 → 성사 + topup 고지 / 미달 → 환불 고지 / 주최자 취소 → 구분 문구 (3계정, 마감은 DB로 과거 설정)
- [x] T031 [US3] `app/fundings/actions/manage.ts` — `cancelFunding`(OPEN 조건부 UPDATE → settle 경유) · `retryFundingTopup`(상한 검사 → 수단 변경 → settle 재진입)
- [x] T032 [P] [US3] 알림 목록 확장 — funding 4종 문구·탭 이동 매핑 (`components/notification/` — M2·M3 파일)
- [x] T033 [US3] T030 초록 — **마일스톤 4 완료 판정**: 달성선 기준 성사·취소, 미달 전액 환불, 차액 자동 결제

**Checkpoint**: 돈의 흐름 완결 — 성사·미달·취소·차액·환불 전부

---

## Phase 6: User Story 4 - 결과·내역·홈 (Priority: P2)

**Goal**: 종료 결과 3변형 · 펀딩 내역 · 홈 섹션 활성화.

**Independent Test**: quickstart V6.

- [x] T034 [P] [US4] E2E 먼저 — `tests/e2e/funding-history.spec.ts`: 결과 3변형 / 내역 탭·라벨 / 홈 섹션 임박순
- [x] T035 [US4] `app/fundings/[id]/result/page.tsx` — SCR-M4-07 3변형 (성사 / **차액 주최자 변형** — "차액 N원이 결제되었습니다" / 미달 — 환불 안내 고정 문구)
- [x] T036 [US4] `app/my/fundings/page.tsx` — SCR-M4-08 (내가 연 것/참여한 것 · 진행 중/끝난 · 결과 라벨) + 마이 탭 펀딩 내역 메뉴 노출
- [x] T037 [US4] `app/page.tsx` 홈 펀딩 섹션 활성화 — M3에서 숨긴 자리 (주최·참여·수령 중 OPEN, 마감 임박순)
- [x] T038 [US4] T034 초록

---

## Phase 7: Polish & Cross-Cutting Concerns

- [x] T039 [P] 제약 확인 — `pg_constraint`에서 C9·C10·FK 3행 (quickstart SQL)
- [x] T040 [P] 360px — `mobile-360`에 M4 화면 8종 추가 후 통과 (SC-010)
- [x] T041 [P] `'use client'` 예산(4개 — contracts §6) + 500줄 + **totals 모듈 밖 합산 없는지** 점검 (R3)
- [ ] T042 quickstart V1~V6 수동 검증 (**3계정**) + `skipped` 수 확인 (S 주도)
- [x] T043 `npm run lint` · `npm run build` 통과 → main 병합

---

## Dependencies & Execution Order

- **M3 완료가 Phase 1보다 앞선다** — 전 태스크의 전제
- T003(3계정 픽스처)이 3주체 E2E(T023·T030·T034)를 막는다 — Phase 1에서 가장 먼저
- **T014(settle 시그니처)가 T025(조기 성사)·T031(취소·재시도)을 막는다** — M4 최우선 선행
- T016(DAL — 정산 트리거 연결)이 화면 전부(T026·T035~T037)를 막는다
- T010(totals)이 T014·T016·T025의 공통 하부 — Phase 2 초반 [P]
- US1은 Foundational만으로 시작 가능 · US2는 T014·T016 · US3은 US2 산출물 · US4는 정산 결과 데이터

### Parallel Opportunities

- Phase 2: T006 ∥ T009~T012 ∥ T015 (스키마 T004~T005 후)
- Foundational 후: **US1(개설) ∥ US2 테스트 작성(T023·T024)** · Phase 5~6에서 **US3(정산) ∥ US4 화면**

## Implementation Strategy

- **MVP = Phase 3 (US1)**: 개설 두 분기만으로 R3(PRD) 해소가 시연된다
- **완료 판정 = Phase 5 (US3)**: "달성선 기준 성사·취소 / 미달 전액 환불 / 차액 자동 결제"
- 팀 분담은 [team-assignment.md](./team-assignment.md) (T번호 확정본)

## Notes

- 테스트는 **실패 먼저 확인** (원칙 II) · 마이그레이션은 한 사람만 · `db push` 금지
- E2E·통합은 항상 `PORTONE_MODE=mock` — 실패 유도는 `0000` 카드 (M3 규약)
- **총액 합산은 `lib/funding/totals.ts` 밖에서 금지** — 리뷰 체크 항목
- 차액 동의 문구 수정 시 `FUNDING_CONSENT_VERSION` 업 — 리뷰 체크 항목
- 정산·예약 만료를 경유하지 않는 funding 조회 함수 금지 — 리뷰 체크 항목
