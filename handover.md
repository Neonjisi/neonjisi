# Handover — 다음 세션 시작할 때 볼 것

**작성**: 2026-09-02 · **작성자**: D (ReDocu)

## ✅ M3 D 몫 21개 전부 완료 (2026-09-01)

T058까지 닫혔다 — V2 API Secret 발급·교체 후 스모크 **인증 통과**. 실연동 재검증:

```
npx tsx scripts/portone-smoke.ts   # 없는 빌링키 시도 — 비용 0원
```

## 🟢 M4 D 몫 — 8개 중 6개 완료 (2026-09-02)

M3 완료 전이지만 J 가 먼저 M4 Phase 2~4 를 origin/gnuke-dev 에 올려서(14개) D 도 착수했다.
sub_dev = origin/main(ffe0732, H 의 M3 Phase 2 UI) + origin/gnuke-dev(a691796) 병합 위에 있다.

| 태스크 | 상태 | 산출물 |
|---|---|---|
| T003 3계정 픽스처 | ✅ | `tests/e2e/fixtures/auth.ts` `thirdPage`/`e2eSession3`/`E2E_USER3_SKIP_REASON` · `.env.example` M4 블록 |
| T013 정산 통합 테스트 | ✅ 16건 초록 | `tests/integration/funding-settle.test.ts` |
| T014 `settleFunding()` | ✅ | `lib/funding/settle.ts` + `lib/dal/funding-settle.ts` + `lib/dal/notification.ts`(펀딩 4종) |
| T015 공용 기반 | ✅ | `app/fundings/actions/shared.ts` · `proxy.ts` `/fundings/:path*` · `app/fundings/error.tsx` · J 테스트의 shared mock 제거 |
| T031 `cancelFunding`·`retryFundingTopup` | ✅ 12건 초록 | `app/fundings/actions/manage.ts` · `tests/integration/funding-manage.test.ts` |
| T032 알림 목록 매핑 | ✅ | `lib/notification/display.ts` 펀딩 4종 + 단위 테스트 |
| **T030 정산 E2E** | ⏳ H 대기 | `tests/e2e/funding-settle.spec.ts` — 펀딩 화면(T026~T029·T035)이 없어 쓸 대상이 없다 |
| **T033 마일스톤 완료 판정** | ⏳ T030 뒤 | |

`npm run test` 53파일·573건 초록 · `npm run lint` 0 에러 · `npm run build` 통과.

### 설계 결정 (contracts §2 "구현 노트" 에 정리) — 팀 공유 필요

- `settleFunding(fundingId, { retryTopup?: boolean })` — 시그니처를 뒤로 넓혔다. 자동 재시도 없음.
- **차액 결제 기록 = 주최자 명의 PAID 참여 행 + Payment** (C8 때문). SETTLED 의 paidTotal = goal.
  → **J·H 후속**: 결과 화면 "차액 N원" 은 DAL 에 `topup.amount` 가 필요하다 (`Funding.topupAmount` 컬럼 권장).
- 환불은 건별 선점(refundedAt) → 결제사 → PAID→REFUNDED. 대사 쿼리 `PAID AND refundedAt IS NOT NULL`.
- 차액 결제는 Funding 행 잠금 안에서 끝낸다 (외부 호출 in tx — 이유는 코드 헤더).
- **J 후속**: `shouldSettle()` 에 `SUCCEEDED ∧ topupRetryUntil < now` 트리거 추가 권장 (settle 은 이미 처리한다).

## 다음 세션 참고

- E2E 는 실키가 있어도 **영원히 mock** (`PORTONE_MODE=mock`). 3계정 E2E 는 `E2E_USER3_*` 가 비면 skip — `skipped` 수 확인.
- 빌링키 **발급**은 실연동에서 서버가 못 한다(FR-008) — 결제사 인증 창 위젯은 실서비스 전환 몫.
- 키 자리: V2 API Secret → `.env.local` `PORTONE_API_SECRET` / 토스 클라이언트·시크릿 키 → PortOne 콘솔 채널 설정.
