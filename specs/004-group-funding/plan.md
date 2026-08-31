# Implementation Plan: 고가 선물을 여럿이 함께 준비한다 (마일스톤 4)

**Branch**: `gnuke-dev` (스펙 디렉터리: `004-group-funding`) | **Date**: 2026-08-31 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-group-funding/spec.md`

> **구현 착수는 M3 완료 후다.** 이 plan은 M3 산출물(`Product`·`PaymentMethod`·`Payment`·
> `lib/portone/client.ts`의 `refund`·알림 인프라·M3 contracts의 패턴)이 존재한다는 전제 위에
> 서 있다. M3가 설계에서 벗어나면 이 문서를 그 변경에 맞춰 손본 뒤 착수한다.

## Summary

주최자가 목표·달성선·마감으로 펀딩을 열고, 친구들이 **선결제 2단계 예약**으로 참여하고,
마감 후 **첫 조회가 정산을 트리거**한다(clarify Q1). 미달·취소는 전액 환불, 성사 후 부족분은
주최자 차액 자동 결제.

M3가 세운 구조를 그대로 잇되, 새로 생기는 층은 셋이다.

- **총액 정의 2종을 단일 모듈로** — 판정은 `PAID`만, 캡은 `RESERVED`+`PAID`. 두 합산이
  코드 두 곳에 흩어지면 조용히 깨진다 (도메인 모델 §6)
- **2단계 예약** — `SELECT ... FOR UPDATE`로 잔여 확인·예약을 원자화하고, 결제는 트랜잭션
  밖, 확정/해제로 마무리. 예약 만료는 지연 평가
- **정산 모듈 `settleFunding()`이 돈의 종결을 전부 소유** — 판정 잠금 → 환불 → 차액
  결제 → 정산 확정 → 알림. M3의 `chargeGiftRequest()`와 같은 소유 경계 원칙

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20+ (M3와 동일)

**Primary Dependencies**: M3와 동일 — 새 의존성 없음. 결제·환불은 M3의
`lib/portone/client.ts` 인터페이스(`chargeBillingKey`·`refund`)를 재사용한다.
**`refund`는 M3 R1이 mock에 미리 만들어 둔 것을 여기서 처음 실사용한다**

**Storage**: Supabase PostgreSQL + Prisma. 엔티티 2종 추가, `Payment.fundingContributionId`에
FK 추가(컬럼은 M3 R4 선반영)

**Testing**: M3와 동일 3층. **E2E 계정 3개** — `E2E_USER3_*` 신설(주최자·수령자·참여자
3주체). E2E·통합은 항상 `PORTONE_MODE=mock`

**Target Platform / Project Type**: 웹, Next.js 단일 앱 (동일)

**Performance Goals**: 동시 참여에도 목표 초과 0건(SC-001) · 정산 정확히 1회(clarify Q1) ·
환불·고지 누락 0건(SC-003·004)

**Constraints**: 360px 화면 8종(SC-010) · 지분 공개 3단계 위반 0건(SC-006) ·
게이지 애니메이션 400ms 1회, 카운트다운 모션 금지(§4.7) · `FUNDING_RESERVATION_TTL` env

**Scale/Scope**: 화면 **8종**(SCR-M4-01~08) + 홈 섹션 활성화. 엔티티 2종 + enum 2종 +
`NotificationType` 4종

## Constitution Check

| 원칙 | 판정 | 근거 |
|---|---|---|
| **I. 근거** | ✅ Pass | research 8건 전부 Rationale·대안 포함. clarify 4문답이 spec Clarifications에 |
| **II. 테스트 우선** | ✅ Pass | CHECK C9·C10과 검증 테스트 짝(M3 C5~C8과 동일 구조). 총액 2종·동시 참여 캡·정산 멱등이 통합 테스트 먼저 |
| **III. Server Component 기본** | ✅ Pass | `'use client'` **4개로 한정**(contracts §5). 상세·내역·결과의 데이터 렌더와 지분 마스킹은 서버에서 |
| **IV. 스냅샷 자립** | ✅ Pass | `Funding`이 `productSnapshot`·`receiverDisplayName`을 생성 시 복사. 관계 해제 후에도 진행 중 펀딩이 자기 데이터로 렌더 |
| **V. 연기 기준** | ✅ Pass | 토큰 공유 링크 연기(clarify Q2 — 후행 비용 낮음). `Payment` FK는 지금(M3가 컬럼을 선반영해 둔 것을 회수) |
| **데이터 보호 — 단일 접근 규칙** | ✅ Pass | `canViewFunding`(FR-024)이 `requireActiveFriendship()`을 재사용. 지분 마스킹은 DAL 한 곳에서 |
| **데이터 보호 — 카드·동의** | ✅ Pass | 차액 동의는 `FUNDING_CONSENT_VERSION` 별도 관리(M3 gift 동의와 독립 버전). 빌링키 취급은 M3 구조 그대로 |
| **품질 게이트** | ✅ Pass | lint·build·500줄·`@/*`·`error.tsx` — M3와 동일 |

**위반 없음.**

## Project Structure

### Documentation (this feature)

```text
specs/004-group-funding/
├── plan.md · spec.md · research.md · data-model.md · quickstart.md
├── contracts/server-actions.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root) — M3 구조에 더해지는 것만

```text
app/
├── fundings/
│   ├── error.tsx
│   ├── actions/
│   │   ├── shared.ts            # M3 패턴 이식 (기반 단계)
│   │   ├── create.ts            # US1 — createFunding
│   │   ├── contribute.ts        # US2 — contributeToFunding · cancelReservation
│   │   └── manage.ts            # US3 — cancelFunding · retryFundingTopup
│   ├── new/page.tsx             # SCR-M4-01~03 (3스텝 / 나에게 2스텝)
│   ├── [id]/page.tsx            # SCR-M4-04 상세 (상태 7변형 · 지분 3단계 뷰)
│   ├── [id]/contribute/page.tsx # SCR-M4-05 참여 · SCR-M4-06 결과
│   └── [id]/result/page.tsx     # SCR-M4-07 종료 결과 3변형
├── my/fundings/page.tsx         # SCR-M4-08 내역
└── page.tsx                     # 홈 펀딩 섹션 활성화 (M3에서 숨겨둔 것)

lib/
├── funding/
│   ├── totals.ts                # ★ 총액 정의 2종 단일 모듈 (R3)
│   ├── state.ts                 # 전이 함수 + 예약 만료 지연 평가 (R2)
│   ├── settle.ts                # ★ settleFunding() — 정산 소유 경계 (R1)
│   └── consent.ts               # 차액 동의 문구 + FUNDING_CONSENT_VERSION
└── dal/funding.ts               # 조회 전부 정산·예약 지연 평가 경유 + 지분 마스킹 (R6)

components/funding/              # create-form · contribute-form · cancel-dialog · share-button
prisma/                          # Funding · FundingContribution + C9·C10 + Payment FK
tests/                           # unit(totals·state) · integration(캡·정산 멱등) · e2e(3계정)
```

**Structure Decision**: M3 규칙 셋을 그대로 확장 — ① Action 스토리별 파일 분할
② 결제·환불은 `lib/portone/client.ts`만 경유 ③ 상태 직접 UPDATE 금지, 전이 모듈 경유.
새 규칙 하나: **총액 합산은 `lib/funding/totals.ts` 밖에서 하지 않는다.**

## Phase 0 — Research

**Output**: [research.md](./research.md) — 결정 8건, `NEEDS CLARIFICATION` 0건

| # | 결정 |
|---|---|
| R1 | 정산은 `settleFunding()` 한 곳 — 지연 트리거 + `OPEN→` 조건부 UPDATE 멱등 잠금. 환불·차액·알림까지 소유 |
| R2 | 참여는 2단계 예약 — `FOR UPDATE` 잔여 확인 + `RESERVED`, 결제는 밖, 만료는 지연 해제 |
| R3 | 총액 2종은 단일 모듈 — 판정 `PAID`만 / 캡 `RESERVED`+`PAID` |
| R4 | 스키마 — C9(`min≤goal`)·C10(개설자=수령자→`min=goal`) raw SQL + `Payment` FK 회수 |
| R5 | 환불·차액은 M3 portone 인터페이스 재사용. topup 실패는 성사 유지 + 재시도 → 상한 초과 시 취소·전액 환불 |
| R6 | 접근·지분 — `canViewFunding` = 당사자 + 수령자의 활성 친구. 마스킹은 DAL 한 곳 |
| R7 | 테스트 — 3계정 픽스처 확장, mock 고정, 동시 참여·정산 멱등은 통합 테스트 먼저 |
| R8 | 알림 4종 경계 — 참여 발생은 확정 트랜잭션, 나머지 3종은 settle 안 |

## Phase 1 — Design & Contracts

**Outputs**: [data-model.md](./data-model.md) · [contracts/server-actions.md](./contracts/server-actions.md) ·
[quickstart.md](./quickstart.md) (검증 V1~V6)

### Constitution Check 재평가 (Phase 1 이후)

**위반 없음.** 원칙이 작동한 지점: ① 원칙 IV가 상세·내역 화면의 데이터 소스를 스냅샷으로
고정했다 ② R3의 단일 모듈이 "두 합산이 흩어지면 조용히 깨진다"를 구조로 봉쇄했다
③ 데이터 보호 단일 규칙이 `canViewFunding`을 DAL 한 곳으로 모았다.

### 남은 열린 항목

**없다.** F0 5건 전부 clarify에서 닫혔다.

## Complexity Tracking

> 위반이 없어 비워 둔다.
