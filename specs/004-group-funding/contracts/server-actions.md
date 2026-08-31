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
