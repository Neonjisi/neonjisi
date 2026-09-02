# Data Model: 고가 선물을 여럿이 함께 준비한다 (마일스톤 4)

**Date**: 2026-08-31 | **Plan**: [plan.md](./plan.md) | **Research**: [research.md](./research.md)

M1~M3 스키마의 기존 필드는 바꾸지 않는다. M4는 엔티티 2개를 더하고, `NotificationType`에
4종을 더하고, M3가 선반영한 `Payment.fundingContributionId`에 FK를 붙인다.

---

## 새 엔티티

### Funding — 펀딩

| 필드 | 타입 | 제약 | 근거 |
|---|---|---|---|
| `id` | uuid | PK | |
| `organizerId` | uuid | FK `User` | 개설자 = 수령자 가능 |
| `receiverId` | uuid | FK `User` | C10의 축 |
| `productId` / `productSnapshot` | uuid / Json | FK `Product` | 스냅샷 렌더 (원칙 IV) |
| `goalAmount` | int | | |
| `minAmount` | int | **C9: ≤ goalAmount** · **C10: 개설자=수령자면 = goalAmount** | 확정 결정 5-5 — R3(PRD) 구조적 해소 |
| `deadline` | timestamp | 생성 시 미래 검증 | 정산 트리거의 기준 (R1) |
| `status` | enum `FundingStatus` | `OPEN` \| `SUCCEEDED` \| `SETTLED` \| `FAILED` \| `CANCELLED` | 환불 상태 없음 — FAILED/CANCELLED 구분 유지 (FR-018) |
| `organizerPaymentMethodId` | uuid? | FK `PaymentMethod` | 차액 부담용. 개설자=수령자면 NULL 허용 |
| `organizerConsentAgreedAt` / `consentVersion` | timestamp? / string? | 개설자≠수령자면 필수 | 차액 동의 (FR-004). `FUNDING_CONSENT_VERSION` |
| `receiverDisplayName` | string | | D3 스냅샷 |
| `topupAttemptCount` | int | default 0 | R5 — 차액 재시도 상한 |
| `topupRetryUntil` | timestamp? | | R5 |
| `settledAt` / `failedAt` / `cancelledAt` | timestamp? | | 종착 시각 |
| `createdAt` / `updatedAt` | timestamp | | |

- `@@index([receiverId, status])` · `@@index([organizerId, status])` — 내역·홈 (FR-022·023)
- `@@index([status, deadline])` — 정산 대상 판정 (R1)

### FundingContribution — 참여

| 필드 | 타입 | 제약 | 근거 |
|---|---|---|---|
| `id` | uuid | PK | |
| `fundingId` | uuid | FK `Funding` | |
| `contributorId` | uuid | FK `User` | 추가 참여 허용 — unique 없음 (FR-011) |
| `amount` | int | 1인 상한 없음 (PRD) | 예약 시점 잔여 검증 (R2) |
| `status` | enum `ContributionStatus` | `RESERVED` \| `PAID` \| `REFUNDED` | 환불 진행은 여기 남는다 (FR-018) |
| `reservedUntil` | timestamp | | 예약 만료 — 지연 해제 (R2) |
| `paidAt` / `refundedAt` | timestamp? | | |
| `createdAt` | timestamp | | |

- `@@index([fundingId, status])` — 총액 2종 합산 (R3) · 지분 목록
- `@@index([contributorId, status])` — 참여 내역 (FR-022)

#### 상태 전이 (`lib/funding/state.ts`만 안다)

```
Funding:
  OPEN --정산: paid합 ≥ min (마감/조기)--> SUCCEEDED --차액 결제 완료·불필요--> SETTLED *
  OPEN --정산: paid합 < min (마감)------> FAILED *      (전 PAID 건 환불)
  OPEN --주최자 취소--------------------> CANCELLED *   (전 PAID 건 환불)
  SUCCEEDED --topup 상한 초과 (R5)------> CANCELLED *   (전 PAID 건 환불)

Contribution:
  (예약: FOR UPDATE + 잔여 확인) --> RESERVED --결제 성공--> PAID --환불 실행--> REFUNDED *
                                     RESERVED --실패·만료·취소--> (행 해제/만료 기록)
```

- `*` 종착. 표 밖 전이는 거부 — 단위 테스트 전수 검사.
- `OPEN →` 전이는 전부 **조건부 UPDATE 멱등 잠금**(R1)을 지난다.

---

## 기존 엔티티 변경

| 대상 | 변경 |
|---|---|
| `Payment` | `fundingContributionId`에 **FK 추가** (컬럼은 M3 선반영 — R4). `REFUNDED` 상태 첫 실사용 |
| `NotificationType` | 4종 추가 — `FUNDING_CONTRIBUTION_RECEIVED`(주최자→SCR-M4-04) · `FUNDING_SUCCEEDED`(참여자·수령자→M4-07) · `FUNDING_FAILED_REFUNDED`(참여자→M4-07) · `FUNDING_ORGANIZER_TOPUP`(주최자→M4-07). 생성 경계는 R8 |
| 그 외 전부 | **없음** — `Product`·`PaymentMethod`·`Friendship`·`GiftRequest` 읽기만 |

---

## 제약 (raw SQL — R4)

| # | 제약 이름 | 내용 | 지키는 것 |
|---|---|---|---|
| C9 | `funding_min_le_goal` | `minAmount ≤ goalAmount` | FR-002 |
| C10 | `funding_self_full_goal` | 개설자=수령자 → `minAmount = goalAmount` | FR-003 · SC-005 — 차액이 존재할 수 없다 |
| — | `payment_funding_contribution_fk` | FK 회수 | FR-006 · 결제 참조 무결성 완성 |

> M3 C5~C8과 같은 규칙 — `--create-only` raw SQL · 검증 테스트 짝 · `db push` 금지 ·
> Phase 마지막에 `pg_constraint` 재확인.

---

## 조회 규칙

```
canViewFunding(viewer, f) := viewer ∈ {organizer, receiver} ∪ contributors(f)
                           ∪ activeFriendsOf(f.receiver)          (R6 · FR-024)
잔여 금액   := goalAmount − capTotal      (RESERVED+PAID — R3)
진행바·판정 := paidTotal                  (PAID만 — R3)
정산 트리거 := 조회 시점 status=OPEN ∧ deadline<now → settleFunding()  (R1)
예약 만료   := 조회 시점 RESERVED ∧ reservedUntil<now → 해제           (R2)
```

지분 마스킹(3단계)은 `lib/dal/funding.ts`가 View 타입에서 이미 잘라 내려보낸다 —
비참여 친구의 View에는 금액이 전부 `null`이다 (contracts §3의 `amount: number | null`
타입 계약과 동일 — 값이 새지 않는 것이 요구의 전부다).

---

## 마이그레이션 순서

1. `Funding` · `FundingContribution` + enum 2종 + `NotificationType` 4종 → `migrate dev`
2. raw SQL — C9 · C10 · Payment FK (한 파일)
3. 제약 검증 통합 테스트 (삽입 시도 — C9·C10·FK)

> 마이그레이션은 **한 사람(J)만** 만든다. 3번을 건너뛰지 않는다 — M1 T010/T011 계보.
