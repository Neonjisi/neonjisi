# Contracts: settle 경계 · totals · DAL · Server Actions (마일스톤 4)

**Date**: 2026-08-31 | **Plan**: [plan.md](./plan.md) | **Data Model**: [data-model.md](../data-model.md)

M3 규약을 그대로 잇는다 — `ActionResult`·`guarded`, 실패는 결과 값, PortOne은
`lib/portone/client.ts`만 경유.

---

## 1. `lib/funding/totals.ts` — 총액 단일 모듈 (R3)

```ts
export async function paidTotal(tx, fundingId): Promise<number>   // PAID만 — 판정·진행바
export async function capTotal(tx, fundingId): Promise<number>    // RESERVED+PAID — 잔여 캡
```

**다른 파일에서 참여 금액을 펀딩 단위 총액으로 직접 합산하지 않는다** — 리뷰 체크 항목.

## 2. `lib/funding/settle.ts` — 정산 소유 경계 (R1·R5·R8) ★ M4 최우선 선행 계약

```ts
/**
 * 트리거: 마감 지난 OPEN 펀딩을 지나는 첫 조회(DAL 경유) / 조기 성사(참여 확정) /
 *        주최자 취소 / topup 재시도.
 * 잠금: OPEN→SUCCEEDED|FAILED (또는 OPEN→CANCELLED) 조건부 UPDATE. 0행이면 중단 — 멱등.
 *       ⚠️ 잠금 조건은 status 만 본다 — deadline 술어를 넣지 않는다. 조기 성사(참여 확정)
 *       트리거는 **마감 전**에 들어오며, paidTotal ≥ goalAmount 면 마감 무관 SUCCEEDED 다.
 *       잠금 순서는 항상 Funding 먼저 — Contribution 을 먼저 잠그면 참여 확정 경로
 *       (Funding FOR UPDATE 선점)와 역순 교착이 성립한다.
 * 재진입: 비-OPEN(FAILED·CANCELLED·SUCCEEDED) 상태로 재호출되면 잠금은 0행이지만 그냥
 *       끝내지 않는다 — **환불 미처리 PAID**(마감·취소를 가로질러 확정된 대사 복원 건;
 *       contribute 가 settledMeanwhile 로 재호출한다)를 찾아 환불/정산에 편입한 뒤 종료.
 * 소유: 판정 → 환불 실행(refund, 전 PAID 건) → 차액 결제(chargeBillingKey) → SETTLED 확정
 *       → 알림 3종(FUNDING_SUCCEEDED · FUNDING_FAILED_REFUNDED · FUNDING_ORGANIZER_TOPUP).
 * topup 실패: SUCCEEDED 유지 + topupAttemptCount·retryUntil 기록. 상한 초과 시
 *       CANCELLED 확정 + 전액 환불 + 전원 고지 (clarify Q3).
 */
export async function settleFunding(fundingId: string): Promise<
  | { outcome: 'SETTLED' } | { outcome: 'FAILED' } | { outcome: 'CANCELLED' }
  | { outcome: 'TOPUP_FAILED'; attemptCount: number; retryUntil: Date }
  | { outcome: 'STILL_OPEN' }    // 마감 전이고 paidTotal < goalAmount — 아무것도 하지 않음
>
```

호출자(조회 DAL·조기 성사·취소·재시도)는 이 함수 뒤에서 상태·환불·정산 알림에 손대지 않는다.

### §2 구현 노트 (T014 확정 — 2026-09-02, D)

계약대로 구현하며 스펙이 비워 둔 자리를 아래처럼 못 박았다. 바꾸려면 `tests/integration/funding-settle.test.ts` 가 먼저 빨개진다.

- **두 번째 인자 `opts?: { retryTopup?: boolean }`** — 시그니처를 뒤로 넓혔다(기존 호출 무변경). topup 실패 뒤
  **자동 재시도는 없다**: 플래그 없는 재진입(조회·조기 성사·취소)은 주최자 카드를 다시 긁지 않고 현재
  `TOPUP_FAILED` 상태를 돌려준다. `retryFundingTopup` 만 `{ retryTopup: true }` 로 다음 시도를 쓴다 — 시도 횟수는
  주최자의 것이다. 상한·기한은 M3 와 같은 env(`GIFT_PAYMENT_MAX_ATTEMPTS` · `GIFT_PAYMENT_RETRY_WINDOW`)를 그대로 읽는다.
- **차액 결제의 기록은 주최자 명의 `PAID` 참여 행 + `Payment`** — `Payment` 의 C8(대상 정확히 하나)이 펀딩 자체를
  가리킬 FK 를 허용하지 않아, 스키마를 바꾸지 않고 결제 이력을 잃지 않는 유일한 길이다. 그래서 `SETTLED` 의
  `paidTotal` 은 정확히 `goalAmount` 다(진행바 100%). 차액 행은 `reservedUntil = paidAt` 로 같은 시각이 박힌다
  (예약이 없었으므로). ⚠️ **후속(J·H)**: 결과 화면(SCR-M4-07 주최자 변형 "차액 N원")이 차액 금액을 그리려면 DAL 이
  `topup.amount` 를 내려줘야 한다 — 위 흔적으로 계산하거나, 깔끔하게는 `Funding.topupAmount Int?` 컬럼(J 마이그레이션)을
  더한 뒤 settle 이 기록한다. `FUNDING_ORGANIZER_TOPUP` payload 의 `amount` 에는 이미 실려 있다.
- **환불은 건별 선점 → 결제사 → 확정**. 선점은 `refundedAt` 조건부 UPDATE(상태는 그대로 PAID), 결제사가 받아준 뒤에만
  `PAID→REFUNDED` + `Payment REFUNDED` + `FUNDING_FAILED_REFUNDED` 를 한 트랜잭션으로. 거절되면 선점을 풀어 다음
  재진입이 다시 집는다(mock 은 항상 성공 — 실연동 환불 실패의 운영 처리는 R5 후행). 대사 쿼리: `PAID AND refundedAt IS NOT NULL`.
- **차액 결제는 `Funding` 행 잠금(FOR UPDATE) 안에서 끝낸다** — 펀딩엔 M3 `PAYING` 같은 "결제 중" 상태가 없어, 잠금을
  놓으면 재진입·더블탭이 같은 차액을 두 번 긁는다. 결제사 타임아웃(10초)이 상한이고, 이 시점 펀딩은 OPEN 이 아니라
  새 예약은 어차피 거절된다. 트랜잭션 timeout 30초 (`lib/dal/funding-settle.ts`).
- **`SETTLED` 재진입은 잉여 환불** — 성사 뒤 늦게 확정된 결제(④ 대사)로 `paidTotal > goal` 이면, 가장 늦은 결제부터
  잉여 안에 통째로 들어가는 행만 되돌린다(reason `SURPLUS`). 목표 아래로 내려가는 일은 없다.
- **`CANCELLED` 의 출처**는 `topupAttemptCount > 0` 이면 차액 상한 초과(`cause: TOPUP_EXHAUSTED`, 전원 고지 — 주최자·수령자는
  `amount: 0`), 아니면 주최자 취소(`cause: ORGANIZER`). 알림 payload 형태는 `lib/dal/notification.ts` `FundingNotificationPayload`.
- ✅ **지연 취소 트리거 (후속(J) 완료)**: `shouldSettle()`(state.ts)이 갈래를 둘 가진다 — 마감 지난 `OPEN`, 그리고
  `SUCCEEDED ∧ topupRetryUntil < now`. topup 실패 뒤 주최자가 재시도하지 않아도 **아무 조회나** settle 을 불러 지연
  취소·전액 환불로 확정한다(경계는 settle 의 `isExhausted` 와 같은 엄격 초과). `retryFundingTopup` 은 이제 그 확정을
  앞당기는 수단일 뿐이다. ⚠️ 판정이 `topupRetryUntil` 을 읽으므로 **조회 select 에서 그 열을 빼면 트리거가 조용히
  사라진다** — `lib/dal/funding.ts` 의 `fundingDetailSelect`·`fundingCardSelect` 둘 다 이 열을 포함한다.

## 3. DAL — `lib/dal/funding.ts` (R6)

모든 조회가 **정산 트리거(R1)와 예약 만료 해제(R2)를 경유**한 결과만 반환한다.

| 함수 | 반환 | 인가 |
|---|---|---|
| `getFunding(id)` | `Promise<FundingDetailView>` | `canViewFunding` — 당사자 + 수령자의 활성 친구 (FR-024) |
| `getMyFundings()` | `Promise<{ organized; contributed }>` | 본인 세션 — 내역 탭 2종 (FR-022) |
| `getHomeFundings()` | `Promise<FundingCardView[]>` | 본인 세션 — 내가 주최·참여·수령 중인 OPEN, 마감 임박순 (FR-023) |

```ts
type FundingDetailView = {
  id: string
  role: 'organizer' | 'receiver' | 'contributor' | 'friend'
  status: FundingStatus
  productSnapshot: { name: string; imageUrl: string | null; price: number }
  receiverDisplayName: string
  goalAmount: number; minAmount: number; deadline: Date; serverNow: Date
  paidTotal: number                  // 진행바 (R3)
  remaining: number                  // goal − capTotal (R3)
  reservedInFlight: number           // "결제 중 N원" 줄
  contributions: Array<{             // ★ 지분 마스킹은 여기서 끝난다 (R6)
    displayName: string
    amount: number | null            // organizer·receiver: 전부 / contributor: 자기 것만 / friend: 전부 null
  }>
  myContribution: { amount: number; status: ContributionStatus } | null
  topup: { attemptCount: number; retryUntil: Date | null } | null   // organizer에게만
}
```

## 4. Server Actions — `app/fundings/actions/` 3파일

| 파일 (소유) | Action | 성공 | 실패 코드 |
|---|---|---|---|
| `create.ts` (J) | `createFunding` | `{ fundingId }` | `NOT_FRIENDS` · `NO_PAYMENT_METHOD` · `INVALID_AMOUNTS` · `INVALID_DEADLINE` · `CONSENT_REQUIRED` · `STORAGE_FAILED` |
| `contribute.ts` (J 예약 + D 결제 연결) | `contributeToFunding` | `{ contributionId, outcome }` | `NOT_ALLOWED` · `FUNDING_CLOSED` · `OVER_REMAINING` · `INVALID_AMOUNTS` · `PAYMENT_FAILED` · `STORAGE_FAILED` |
| `contribute.ts` | `cancelReservation` | `{ ok: true }` | `NOT_OWNER` · `NOT_RESERVED` · `STORAGE_FAILED` |
| `manage.ts` (D) | `cancelFunding` | `{ outcome }` | `NOT_ORGANIZER` · `NOT_OPEN` · `STORAGE_FAILED` |
| `manage.ts` (D) | `retryFundingTopup` | `{ outcome }` | `NOT_ORGANIZER` · `NOT_RETRYABLE` · `RETRY_EXPIRED` · `STORAGE_FAILED` |

### `createFunding` — 검사 순서

```
1. 세션
2. 수령자 — 본인이거나 활성 친구 (requireActiveFriendship)
3. 금액 — 0 < minAmount ≤ goalAmount (C9와 이중). 개설자=수령자면 minAmount := goalAmount 강제 (C10과 이중)
4. 마감 — deadline > now
5. (개설자≠수령자) 차액 동의 + 활성 결제수단 — 없으면 CONSENT_REQUIRED / NO_PAYMENT_METHOD
6. 생성 — productSnapshot · receiverDisplayName 스냅샷 + consentVersion 기록
```

### `contributeToFunding` — 2단계 (R2)

```
1. 세션 + canViewFunding — 아니면 NOT_ALLOWED
2. [트랜잭션] SELECT ... FOR UPDATE (Funding) → status=OPEN 확인(FUNDING_CLOSED)
   → remaining = goal − capTotal → amount > remaining이면 OVER_REMAINING
   → RESERVED 생성 (reservedUntil = now + FUNDING_RESERVATION_TTL)
3. [밖] chargeBillingKey (참여자 빌링키 — 없으면 등록 강제 진입은 화면이 처리)
4. 성공: [트랜잭션] PAID 확정 + Payment 기록 + FUNDING_CONTRIBUTION_RECEIVED 알림(R8)
   → paidTotal = goal이면 settleFunding() 즉시 호출 (조기 성사)
   실패: RESERVED 해제 → PAYMENT_FAILED 반환 (화면이 재시도 안내)
```

### `cancelFunding` / `retryFundingTopup`

```
cancelFunding:  OPEN → CANCELLED 조건부 UPDATE (0행이면 NOT_OPEN) → settleFunding() 경유 환불·고지
retryFundingTopup: SUCCEEDED + 상한 검사 → (수단 변경 반영) → settleFunding() 재진입
```

## 5. 라우트 · proxy

| 경로 | 화면 | 비고 |
|---|---|---|
| `/fundings/new` | SCR-M4-01~03 | 3스텝(친구에게) / 2스텝(나에게 — 달성선 잠금) |
| `/fundings/[id]` | SCR-M4-04 | 상태 7변형 · 지분 3단계 뷰 · 주최자 취소 메뉴 · 공유(URL 복사) |
| `/fundings/[id]/contribute` | SCR-M4-05·06 | 고지 2종 · 결과 3변형 |
| `/fundings/[id]/result` | SCR-M4-07 | 종료 결과 3변형 (topup 주최자 변형 포함) |
| `/my/fundings` | SCR-M4-08 | 내가 연 것 / 참여한 것 |

`proxy.ts` matcher에 `/fundings/:path*` 추가. 홈(`/`)의 펀딩 섹션은 M3에서 숨긴 것을 활성화.
상품 상세(SCR-M3-04)의 `( 여럿이 모아서 선물하기 )` 진입점 활성화.

## 6. 클라이언트 컴포넌트 예산 — 4개

| 컴포넌트 | 왜 클라이언트인가 |
|---|---|
| `components/funding/create-form.tsx` | 3스텝 상태 · 대상 분기 · 달성선 잠금 · 동의 체크 |
| `components/funding/contribute-form.tsx` | 금액 입력 · 빠른 칩 · 잔여 초과 비활성 |
| `components/funding/cancel-dialog.tsx` | 주최자 취소 확인 (M2 다이얼로그 패턴) |
| `components/funding/share-button.tsx` | URL 복사 · OS 공유 (M2 invite-link-card 패턴) |

게이지는 Server Component + CSS 애니메이션(400ms 1회, §4.7)으로 충분하다 — 클라이언트 예산을
쓰지 않는다. **지분 마스킹·잔여 계산을 클라이언트에서 하지 않는다** (R6).
