# Research: 고가 선물을 여럿이 함께 준비한다 (마일스톤 4)

**Date**: 2026-08-31 | **Plan**: [plan.md](./plan.md) | **Spec**: [spec.md](./spec.md)

M3 산출물 위에 펀딩을 얹을 때의 결정 8건. 결정마다 근거를 붙인다(constitution 원칙 I).

---

## R1 — 정산은 `settleFunding()` 한 곳, 지연 트리거 + 멱등 잠금

**Decision**: `lib/funding/settle.ts`의 `settleFunding(fundingId)`이 정산의 유일한 실행
지점이다. 트리거는 **마감 이후의 첫 조회**(clarify Q1) — `lib/dal/funding.ts`의 모든 조회가
`deadline < now() AND status = OPEN`이면 이 함수를 지난다.

```ts
// 판정 잠금 — M3 R2(PAYING 잠금)와 같은 원리
const locked = await tx.funding.updateMany({
  where: { id, status: 'OPEN', deadline: { lt: now } },
  data: { status: paidTotal >= minAmount ? 'SUCCEEDED' : 'FAILED' },
})
if (locked.count === 0) return  // 다른 조회가 이미 정산 중 — 중단
```

⚠️ 위 스케치의 `deadline: { lt: now }` 는 **마감 경로 전용**이다. 조기 성사(참여 확정)
트리거는 마감 전에 들어오므로 잠금은 `status: 'OPEN'` 만 보고, 성사 판정(`paidTotal ≥
goalAmount`)이 SUCCEEDED 를 결정한다. 비-OPEN 재진입 처리 포함 — contracts §2 참조.

잠금 이후 settle이 소유하는 것 — `FAILED`/`CANCELLED`: 전 `PAID` 건 환불 실행 +
`FUNDING_FAILED_REFUNDED` 알림. `SUCCEEDED`: 부족분 있으면 주최자 차액 결제(R5) →
`SETTLED` 확정 + `FUNDING_SUCCEEDED`·`FUNDING_ORGANIZER_TOPUP` 알림.

**Rationale**: M3의 만료(R3)와 같은 지연 평가 원칙이되, 정산은 돈이 움직이므로 **멱등
잠금이 필수**다 — 동시 조회 두 개가 각각 환불을 걸면 이중 환불이다. 조건부 UPDATE가 한
조회만 통과시킨다. cron 없음 원칙 유지, 시연은 마감 후 화면 열기로 정산을 유발.

**Alternatives considered**: 주최자 수동 정산(안 누르면 환불이 멈춤 — 기각) ·
스케줄러(인프라 의존 + 주기 오차 — 실서비스 전환 시 후행 추가, 비용 낮음).

---

## R2 — 참여는 2단계 예약, 만료는 지연 해제

**Decision**: 도메인 모델 §6 그대로. ① 트랜잭션 안에서 `SELECT ... FOR UPDATE`로 `Funding`
행을 잠그고 잔여(capTotal 기준)를 확인한 뒤 `RESERVED` 참여 건 생성(`reservedUntil = now +
FUNDING_RESERVATION_TTL`) ② 트랜잭션 밖에서 PortOne 결제 ③ 성공 `PAID` 확정(이때 paidTotal =
goal이면 **조기 성사 — R1의 성사 경로 즉시 실행**), 실패·초과 시 예약 해제. 만료된 예약은
조회 시점 지연 평가로 해제한다(M3 R3과 같은 방식, `lib/funding/state.ts`).

**Rationale**: 트랜잭션만으로는 캡 초과를 못 막는다 — 결제가 외부 호출이라 트랜잭션 안에
넣을 수 없다. 예약이 잔여를 선점해야 동시 참여의 합이 목표를 넘지 않는다(SC-001).

**Alternatives considered**: 낙관적 재시도(결제 후 초과 발견 시 환불 — 돈이 나갔다 돌아오는
경험, 기각) · 앱 뮤텍스(다중 인스턴스 무의미).

---

## R3 — 총액 정의 2종은 단일 모듈

**Decision**: `lib/funding/totals.ts`에 두 함수만 둔다 — `paidTotal(fundingId)`(판정·진행바
용, `PAID`만) · `capTotal(fundingId)`(잔여 캡용, `RESERVED`+`PAID`). **다른 파일에서 참여
금액을 펀딩 단위 총액으로 직접 합산하지 않는다** — 리뷰 체크 항목. (한 뷰어의 자기 참여분을
접는 소액 합산은 이 금지의 대상이 아니다 — 금지의 근거는 아래 두 총액 정의의 표류뿐이다.)

**Rationale**: 도메인 모델 §6 — "두 합산이 코드 두 곳에 흩어지면 조용히 깨진다." 판정에
`RESERVED`를 넣으면 결제 안 될 돈으로 성사를 선언하고, 캡에서 빼면 동시 참여가 목표를
넘긴다. 화면 표기(진행바 = paid / "결제 중 N원" = cap − paid)도 이 모듈을 쓴다.

---

## R4 — CHECK 2종 raw SQL + `Payment` FK 회수

**Decision**: M3 C5~C8과 같은 `--create-only` 방식으로 넣는다.

```sql
-- C9: 달성선 상한
ALTER TABLE "Funding" ADD CONSTRAINT funding_min_le_goal
  CHECK ("minAmount" <= "goalAmount");
-- C10: 개설자 = 수령자면 차액 개념 소멸 (확정 결정 5-5)
ALTER TABLE "Funding" ADD CONSTRAINT funding_self_full_goal
  CHECK ("organizerId" <> "receiverId" OR "minAmount" = "goalAmount");
-- M3 R4가 선반영한 컬럼에 FK 추가
ALTER TABLE "Payment" ADD CONSTRAINT payment_funding_contribution_fk
  FOREIGN KEY ("fundingContributionId") REFERENCES "FundingContribution"("id");
```

**Rationale**: C10이 PRD R3의 구조적 해소다 — 화면(달성선 잠금)은 첫 방어선, CHECK가
마지막 방어선. `Payment` XOR(C8)는 M3에서 이미 걸려 있으므로 FK만 붙이면 결제 데이터의
참조 무결성이 완성된다. 검증 테스트 짝 규칙(M1 T010/T011 계보)도 동일하게.

---

## R5 — 환불·차액은 M3 portone 인터페이스 재사용, topup 실패는 재시도 → 취소

**Decision**: 환불은 `getPortOneClient().refund()`(M3 R1이 mock에 미리 만든 것의 첫 실사용),
차액은 `chargeBillingKey()`를 주최자 빌링키로. **topup 실패 시 `SUCCEEDED` 유지 + 주최자
재시도**(수단 변경 포함, M3와 같은 env 상한 3회·24시간 — `Funding`에 시도 횟수·기한 기록),
상한 초과 시 **`CANCELLED` 확정 + 전액 환불 + 전원 고지** (clarify Q3).

**Rationale**: 새 결제 메커니즘을 만들지 않는다 — M3의 재시도 UI·env·실패 정규화를 그대로
쓴다. "돈 문제로 완결하지 못하면 환불"이 미달·취소·topup 실패 초과 셋의 공통 종착이라
참여자 입장에서 규칙이 하나다. mock 환불은 항상 성공 — 실연동 환불 실패 처리는 실키 전환
시점의 후행 과제로 남긴다(후행 비용 낮음).

---

## R6 — 접근은 `canViewFunding` 하나, 지분 마스킹은 DAL 한 곳

**Decision**: `lib/dal/funding.ts`가 유일한 관문이다.

```
canViewFunding(viewer, f) := viewer ∈ {organizer, receiver}
                           ∪ contributors(f)
                           ∪ activeFriendsOf(f.receiver)     // requireActiveFriendship 재사용
```

지분 뷰는 DAL이 viewer 역할에 따라 마스킹해 내려준다 — 주최자·수령자: 전원 이름+금액 /
참여자: 이름 나열 + 자기 금액만 / 비참여 친구: 이름만. **금액 마스킹을 화면에서 하지
않는다** — 클라이언트로 보내고 거기서 가리면 R5(지분 공개) 위반이 뷰소스에서 드러난다.

**Rationale**: clarify Q2 + constitution 단일 접근 규칙. M2의 `requireActiveFriendship()`을
재사용하므로 새 접근 제어 지점이 생기지 않는다. 공유 URL은 권한을 만들지 않는다.

---

## R7 — 테스트: 3계정 픽스처, 동시 참여·정산 멱등은 통합 테스트 먼저

**Decision**: `tests/e2e/fixtures/auth.ts`를 3계정(`E2E_USER3_*`)으로 확장한다 — M2에서
2계정으로 확장한 것과 같은 방식, 같은 함정(`skipped` 확인). 통합 테스트 우선 대상:
① 동시 참여 2건이 잔여를 다툴 때 합계 ≤ 목표 ② 동시 조회 2건의 정산이 1회만 실행
③ 판정에 `RESERVED` 불포함 ④ topup 실패 → 재시도 → 상한 초과 취소. E2E·통합은 항상
`PORTONE_MODE=mock`, 실패 유도는 M3의 `0000` 카드 규약.

**Rationale**: 펀딩은 3주체 구조라 2계정으로는 지분 3단계 뷰와 "참여자끼리 금액 비공개"를
검증할 수 없다(초안 §8). 동시성 테스트 선례는 M3 `gift-respond-concurrent.test.ts`.

---

## R8 — 알림 4종의 생성 경계

**Decision**: `FUNDING_CONTRIBUTION_RECEIVED`(주최자)는 참여 **확정 트랜잭션**(R2 ③) 안에서.
나머지 3종 — `FUNDING_SUCCEEDED`(참여자·수령자) · `FUNDING_FAILED_REFUNDED`(참여자) ·
`FUNDING_ORGANIZER_TOPUP`(주최자) — 은 **전부 `settleFunding()` 안**이다(R1). 호출자는
정산 알림을 보내지 않는다.

**Rationale**: M3 R7과 같은 원리 — 정산 트리거 지점이 여럿(상세·홈·내역 조회 + 조기 성사)
이라 알림을 호출자에 두면 복제·중복 발송이 난다. "동의를 받았어도 고지는 별개다"의
`FUNDING_ORGANIZER_TOPUP`은 차액 결제 성공 직후 같은 흐름에서 생성 — 누락되면 R1 소유
경계 위반이고 통합 테스트(R7 ④)가 잡는다.
