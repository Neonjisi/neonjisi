# Quickstart: 고가 선물을 여럿이 함께 준비한다 (마일스톤 4)

**Date**: 2026-08-31 | **Plan**: [plan.md](./plan.md)

검증 방법을 담는다. 스키마는 [data-model.md](./data-model.md), 인터페이스는
[contracts/server-actions.md](./contracts/server-actions.md).

## 전제 조건

**M3가 완료된 상태에서 시작한다** — 상품 시드·빌링키 등록·결제 인터페이스(mock)·알림이
동작한다.

| 항목 | 값 |
|---|---|
| **테스트 계정 3개** | 주최자 A · 수령자 B · 참여자 C — `E2E_USER4_*` 신설 (R7) |
| 결제 모드 | `PORTONE_MODE=mock` — 실패 유도는 `0000` 카드 (M3 규약) |
| 포트 | `:3000` 고정 |

`.env.local`에 추가:

```
E2E_USER4_EMAIL=
E2E_USER4_PASSWORD=
FUNDING_RESERVATION_TTL=5m
```

> Supabase → Add user → **Auto Confirm** (M2 T001과 동일). ⚠️ 비어 있으면 3계정 E2E가
> **실패 대신 skip** — `skipped` 수를 반드시 본다. **틀리면 skip 이 아니라 실패다**:
> `E2E_USER3_*` 슬롯은 계정 없이 값만 채워 돌아다니다 이 함정을 밟아서 폐기했다.

## 준비

```bash
npx prisma migrate dev     # C9·C10 + Payment FK 포함. db push 금지
npm run dev                # :3000
```

## 검증 시나리오 (A=주최자 · B=수령자 · C=참여자)

### V1 — 개설 두 분기 (US1)

1. A가 "친구에게"(수령자 B)로 개설 → 3스텝, 마지막에 차액 동의(**최대 부담액 숫자** ·
   결제수단 필수 · 체크 전 비활성) (FR-004)
2. A가 "나에게"로 개설 → 2스텝, 달성선이 **잠긴 채** 목표와 동일 표시 (FR-003)
3. 달성선 > 목표 입력 → 거부. DB 직접 삽입도 **C9·C10이 거부** (하단 SQL 확인)
4. 마감일 과거 → 거부. 목표 < 상품가 → **경고만**

### V2 — 참여와 지분 공개 (US2)

1. C가 상세 진입 → 진행바(**결제 완료분만**) · 남은 금액 · 예약 있으면 "결제 중 N원" 줄 (FR-009)
2. 참여 화면 → **고지 2종 나란히**("공개됩니다"·"환불됩니다") + 마지막 칩 "전액" (FR-010)
3. C가 참여 → 결제 → 완료 화면 + A에게 참여 알림 (FR-012)
4. 잔여 초과 입력 → 버튼 비활성 + 서버 거부 (FR-007)
5. **지분 3단계**: A·B는 전원 이름+금액 / C는 자기 금액만 / 비참여 친구는 이름만 (FR-013)
6. 비친구 계정으로 상세 URL 직접 접근 → 거부 (FR-024)
7. `0000` 카드로 참여 → 결제 실패 → **예약 해제** 확인 (잔여 금액 복구)

### V3 — 동시성·조기 성사 (US2 Edge)

1. (통합 테스트) 동시 참여 2건이 잔여를 다툰다 → 합계 ≤ 목표, 한쪽 `OVER_REMAINING` (SC-001)
2. 결제 완료 합계 = 목표 → **조기 성사** — 참여 버튼 비활성, 정산 즉시 실행 (FR-015)
3. 예약만 있는 상태로 TTL 경과 → 조회 시 예약 해제, 잔여 복구 (FR-008)

### V4 — 정산: 성사·차액 (US3)

1. 달성선 이상·목표 미만으로 채우고 마감을 과거로 → **아무 화면이나 연다** → 정산 트리거
   (clarify Q1) → 성사 + A 카드로 차액 자동 결제 + **`FUNDING_ORGANIZER_TOPUP` 고지** (FR-016)
2. (통합 테스트) 동시 조회 2건 → **정산 정확히 1회** (SC — 멱등 잠금)
3. A의 카드가 `0000`(topup 실패) → 성사 유지 + 재시도 화면 → 정상 카드로 재시도 → SETTLED.
   상한 초과 시 → CANCELLED + 전액 환불 (clarify Q3)

### V5 — 정산: 미달·취소·환불 (US3)

1. 달성선 미만으로 마감 → 미달 — C의 `PAID` 건 **전액 환불** + `FUNDING_FAILED_REFUNDED` (FR-017)
2. A가 진행 중 펀딩 취소 → 환불 + **미달과 다른 문구** ("주최자가 취소했어요") (FR-018)
3. 환불 안내 문구가 "영업일 3~5일" 고정인지 (clarify Q4)
4. (판정 검증) `RESERVED`만 있는 금액으로는 성사가 선언되지 않는다 (SC-002)

### V6 — 결과·내역·홈 (US4)

1. 결과 3변형 — 성사(참여자·수령자) / 차액 발생(주최자 — "차액 N원이 결제되었습니다") / 미달
2. 내역 — 내가 연 것/참여한 것 · 진행 중/끝난 · 결과 라벨 (FR-022)
3. 홈 펀딩 섹션 활성화 — 주최·참여·수령 중 OPEN, 마감 임박순 (FR-023)
4. B와 관계 해제 후 → 진행 중 펀딩이 스냅샷으로 계속 렌더

### 제약 확인 (Phase 마지막)

```sql
SELECT conname FROM pg_constraint
 WHERE conname IN ('funding_min_le_goal','funding_self_full_goal','payment_funding_contribution_fk');
```

**3행 전부** 나와야 한다. 안 나오면 `db push` DB다.

## 테스트 · 품질 게이트

```bash
npm run test                              # totals·state·캡·정산 멱등 포함
npx playwright test --project=chromium
npx playwright test --project=mobile-360  # M4 화면 8종 (SC-010)
npm run lint && npm run build
```

> **`skipped` 수 확인** — 3번째 계정이 없으면 3주체 E2E가 조용히 skip 된다.
