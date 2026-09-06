# T042 수동 검증 체크리스트 — quickstart V1~V6

**Purpose**: 자동 테스트가 이미 지키는 항목과 **사람이 직접 봐야만 하는 항목**을 가른다
**Created**: 2026-09-06
**Feature**: [quickstart.md](../quickstart.md) · [tasks.md](../tasks.md) T042
**주도**: S

> T042 를 quickstart 전체 재연으로 읽으면 V1~V6 스물몇 항목을 손으로 밟게 된다.
> 실제로는 대부분이 E2E·통합에 이미 들어 있다. 아래 "이미 자동" 을 다시 하지 말고,
> "사람만 가능" 다섯 줄에 시간을 쓴다.

## 사전 상태 (2026-09-06 확인)

- [x] 테스트 계정 4개 전부 로그인된다 — A=`USER1` · B=`USER2` · C=`USER4` · D(비친구)=`USER5`
      (`USER5` 는 계정이 없던 게 아니라 비밀번호 불일치였다. 대시보드에서 재설정해 해결)
- [x] 제약 3행 확인 — `funding_min_le_goal` · `funding_self_full_goal` ·
      `payment_funding_contribution_fk` 전부 존재 (`db push` DB 가 아니다)
- [x] 상품 목록 잔여물 정리 — `펀딩 제약 테스트 상품` 2건 · `원두 정기구독 (M3-DEMO)` 1건을
      `isActive=false` 로 내렸다. 활성 상품 52개(시드) 만 남는다
- [ ] ⚠️ 카테고리 잔여물 2건(`펀딩제약테스트-<uuid>`)은 **그대로 남아 있다** — `Category` 에
      `isActive` 가 없어 지우지 않으면 못 숨긴다. 취향 선택 화면 대분류 목록 **맨 끝**
      (`sortOrder=9999`)에 두 줄로 뜬다. 골라도 상품은 비어 있다. 검증 스크린샷에 찍힌다
- [x] `skipped` 수 확인 — **skip 0** (2026-09-06 전체 실행 78건 기준). `USER5` 가 살아나며
      `funding-contribute.spec.ts:76` 이 skip·실패에서 통과로 바뀌었다

## 이미 자동 — 다시 하지 않는다

| quickstart | 무엇이 지키는가 |
|---|---|
| V1-1 친구에게 3스텝 + 차액 동의 | `funding-create.spec.ts:68` |
| V1-2 나에게 2스텝 · 달성선 잠김 | `funding-create.spec.ts:96` |
| V1-3 달성선 > 목표 거부 (화면) | `funding-create.spec.ts:110` |
| V1-3 달성선 > 목표 거부 (**DB 직접 삽입**) | `funding-constraints.test.ts` (a)(b) — C9·C10 |
| V1-4 마감일 과거 · 목표 < 상품가 | `funding-create.spec.ts:110` |
| V2-1 진행바(결제 완료분만) · 남은 금액 | `funding-contribute.spec.ts:52` |
| V2-2 고지 2종 나란히 | `funding-contribute.spec.ts:52` |
| V2-3 참여 → 결제 → 완료 화면 | `funding-contribute.spec.ts:52` |
| V2-4 잔여 초과 입력 거부 | `funding-contribute.spec.ts:52`·`:76` |
| V2-5 지분 3단계 공개 | `funding-contribute.spec.ts:76` |
| V2-6 비친구 상세 접근 거부 (FR-024) | `funding-contribute.spec.ts:76` |
| V2-7 결제 실패 → 예약 해제 | `funding-cap-concurrent.test.ts` ④ |
| V3-1 동시 참여 · 잔여 다툼 | `funding-cap-concurrent.test.ts` |
| V3-2 조기 성사 settle 1회 | `funding-cap-concurrent.test.ts` |
| V3-3 TTL 경과 → 예약 해제 · 잔여 복구 | `funding-cap-concurrent.test.ts:369` |
| V4-1 성사 + 차액 자동 결제 고지 | `funding-settle.spec.ts:239` |
| V4-2 동시 조회 → 정산 1회 | `funding-settle.test.ts` |
| V5-1 미달 → 전액 환불 | `funding-settle.spec.ts:271` |
| V5-2 주최자 취소 → 다른 문구 | `funding-settle.spec.ts:298` |
| V5-3 환불 문구 "영업일 기준 3~5일" | `notification-display.test.ts:194` · `funding-history.spec.ts:119` |
| V5-4 RESERVED 만으로 성사 안 됨 | `funding-settle.test.ts` |
| V6-1 결과 3변형 | `funding-history.spec.ts:122`·`:136`·`:147` |
| V6-2·3 내역 · 홈 펀딩 섹션 | `funding-history.spec.ts:95` (`test.slow()` 적용 후 통과) |

## 사람만 가능 — 여기에 시간을 쓴다

- [ ] **V2-1 "결제 중 N원" 줄** — 예약만 잡힌 상태에서만 뜬다.
      `app/fundings/[id]/page.tsx:76` 이 `reservedInFlight > 0` 일 때만 그린다.
      재연: C 가 참여 결제를 시작해 예약이 잡힌 채로 두고, 그 사이 A 가 상세를 연다.
      진행바(결제 완료분)와 **별개 줄**로 보여야 한다 (FR-009)
- [ ] **V2-2 마지막 칩 "N원 전액"** — 참여 화면 금액 칩은 20,000 · 50,000 · 잔여 3개이고
      (`components/funding/contribute-form.tsx:33`) **잔여 칩에만** "전액" 이 붙는다
      (`:54`). 잔여가 20,000 이하면 칩이 합쳐지는 것도 함께 본다
- [ ] **V2-3 A 에게 참여 알림 도착** — E2E 는 C 의 완료 화면까지만 본다.
      C 가 참여한 뒤 A 의 알림 목록에 참여 알림이 남는지 (FR-012)
- [ ] **V4-3 차액 결제 실패 → 재시도** — A 의 카드를 `0000` 으로 두고 성사시킨다.
      성사는 유지된 채 재시도 화면(SCR-M4-06)이 뜨고 → 정상 카드로 바꿔 재시도 → `SETTLED`.
      재시도 상한을 넘기면 → `CANCELLED` + 전액 환불 (clarify Q3).
      경로는 `app/fundings/actions/manage.ts` 재시도. **E2E 없음**
- [ ] **V6-4 관계 해제 후 스냅샷** — B 와 친구 관계를 해제한 뒤에도 진행 중 펀딩이
      스냅샷 값으로 계속 렌더되는지 (이름이 사라지거나 화면이 깨지지 않아야 한다)

## Notes

- **잔여물의 출처**: 카테고리 `펀딩제약테스트-<uuid>` 와 상품 `펀딩 제약 테스트 상품` 은
  `funding-constraints.test.ts` 가 만든다. 그 테스트의 cleanup 자체는 정상이고, 남은 것은
  **중단된 실행**의 잔여다. `User` 표의 `M4 제약 테스트 organizer/receiver/contributor` 6명도 같다.
- **E2E 상태 (2026-09-06 마지막 실행)**: 78건 중 **74 통과 · 4 실패 · skip 0**.
  남은 4건은 전부 **공유 계정에 상태가 쌓여서** 나는 것이고 M4 와 무관하다:
  `invite-control:144`(A 의 활성 초대 링크 `usedCount=13` 인데 "1명 사용" 기대 —
  `getOrCreateActiveInviteLink()` 가 링크를 재사용하니 누적된다, FR-004) ·
  `invite-control:282`·`:302`(알림이 안 비워진다 — e2e2 에 126건) ·
  `gift-request:174`(대체 상품 배송지 입력 후 `/result` 로 넘어가지 않고
  `/respond/shipping?counterProductId=…` 에 머문다 — **이건 화면 동작 쪽일 수 있어 따로 봐야 한다**).
  T042 수동 검증을 막지는 않는다.
- T044(문구 확정 반영)가 끝난 뒤 만든 목록이다 — 검증이 옛 문구를 보지 않는다.
