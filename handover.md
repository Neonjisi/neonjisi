# Handover — 다음 세션 시작할 때 볼 것

**작성**: 2026-09-02 · **작성자**: D (ReDocu)

## ✅ M3 D 몫 21개 전부 완료 (2026-09-01)

T058까지 닫혔다 — V2 API Secret 발급·교체 후 스모크 **인증 통과**. 실연동 재검증:

```
npx tsx scripts/portone-smoke.ts   # 없는 빌링키 시도 — 비용 0원
```

## ✅ M4 D 몫 8개 전부 완료 — 마일스톤 4 완료 판정 초록 (2026-09-04)

D 의 M4 는 2fc826e 로 main 에 반영했고, 그 위에 H 가 811b062(E2E 안정화 · 계정 4개 재편)를 올렸다.
**main = sub_dev = 811b062** (2026-09-04). 이 커밋 기준 M4 E2E 12/12 chromium 초록 — 아래 실측.

| 태스크 | 상태 | 산출물 |
|---|---|---|
| T003 다계정 픽스처 | ✅ | 계정 1·2·4는 `thirdPage`까지의 3주체, 계정 5는 `fourthPage` 비친구 검증 · `.env.example` M4 블록 |
| T013 정산 통합 테스트 | ✅ 16건 초록 | `tests/integration/funding-settle.test.ts` |
| T014 `settleFunding()` | ✅ | `lib/funding/settle.ts` + `lib/dal/funding-settle.ts` + `lib/dal/notification.ts`(펀딩 4종) |
| T015 공용 기반 | ✅ | `app/fundings/actions/shared.ts` · `proxy.ts` `/fundings/:path*` · `app/fundings/error.tsx` · J 테스트의 shared mock 제거 |
| T031 `cancelFunding`·`retryFundingTopup` | ✅ 12건 초록 | `app/fundings/actions/manage.ts` · `tests/integration/funding-manage.test.ts` |
| T032 알림 목록 매핑 | ✅ | `lib/notification/display.ts` 펀딩 4종 + 단위 테스트 |
| **T030 정산 E2E** | ✅ | `tests/e2e/funding-settle.spec.ts` V4-1·V5-1·V5-2 3건 + `tests/e2e/fixtures/funding-db.ts` |
| **T033 마일스톤 완료 판정** | ✅ **6/6 초록** | `funding-settle.spec.ts` chromium 3건 + mobile-360 3건. probe 를 전부 단언으로 바꿔 화면 부재는 이제 실패다. 정산 경로(mock 결제 → 마감 → 판정 → 환불·차액 → 알림 → 결과 화면)가 E2E 로 처음 완주했다 (2026-09-04) |

`npm run test` 54파일·576건 초록 · `npm run lint` 0 에러 · `npm run build` 통과.
`npx playwright test funding-settle` → **6 passed** (chromium 3 · mobile-360 3, 각 ~2.3분).
811b062 병합 후 재실측(새 서버): `funding-settle` 3/3 (2.6m) + H 의 `funding-create`·`contribute`·`history` 9/9 (4.5m)
— **M4 E2E 12/12 chromium**, 서버 에러 0. H 의 4계정 비친구 시나리오와 history 재실행까지 포함.

### 설계 결정 (contracts §2 "구현 노트" 에 정리) — 팀 공유 필요

- `settleFunding(fundingId, { retryTopup?: boolean })` — 시그니처를 뒤로 넓혔다. 자동 재시도 없음.
- **차액 결제 기록 = 주최자 명의 PAID 참여 행 + Payment** (C8 때문). SETTLED 의 paidTotal = goal.
  → **해결됨 (H, 2026-09-03)**: 컬럼 없이 `lib/dal/funding.ts` 가 `contributorId === organizerId ∧ PAID ∧
  reservedUntil === paidAt` 로 차액 행을 가려낸다. `funding-settle.ts:252` 가 일부러 심는 흔적과 맞물린 것이라
  **그 흔적은 이제 두 파일에 걸친 계약이다** — 차액 행의 시각을 건드리면 결과 화면의 "차액 N원" 이 조용히 사라진다.
- 환불은 건별 선점(refundedAt) → 결제사 → PAID→REFUNDED. 대사 쿼리 `PAID AND refundedAt IS NOT NULL`.
- 차액 결제는 Funding 행 잠금 안에서 끝낸다 (외부 호출 in tx — 이유는 코드 헤더).
- **J 후속**: `shouldSettle()` 에 `SUCCEEDED ∧ topupRetryUntil < now` 트리거 추가 권장 (settle 은 이미 처리한다).

## 다음 세션 참고

- **계정 1·2·4를 주최자·수령자·참여자에, 계정 5를 비친구 접근 검증에 쓴다.** USER3 슬롯은 계정 없이
  값만 채워져 `Invalid login credentials` 를 내므로 폐기했다(비면 skip · 틀리면 실패).
- ⚠️ **비밀번호에 `#` 이 있으면 따옴표로 감싼다.** dotenv 가 `#` 뒤를 주석으로 잘라 15자가 13자로 들어갔고,
  증상은 계정 문제와 똑같은 `Invalid login credentials` 였다 — 콘솔 확인·Auto Confirm·재생성을 다 의심한 뒤에야
  찾았다 (2026-09-04). `$이름` 도 dotenv-expand 가 치환한다. .env.example 에 적어 뒀다.
- T030 의 마감 조작은 `tests/e2e/fixtures/funding-db.ts` 하나로 막아 뒀다 — **쓰는 열은 `deadline` 뿐**이고
  읽기 헬퍼는 일부러 두지 않았다(정산 결과 판정은 화면·알림으로, 상태 전이는 T013 통합 테스트가).
  `test.afterAll` 에서 `closeFundingDb()` 를 부르지 않으면 Playwright 가 안 끝난다.
- E2E 는 실키가 있어도 **영원히 mock** (`PORTONE_MODE=mock`). 다계정 E2E 는 `E2E_USER4_*`/`E2E_USER5_*` 가 비면 skip — `skipped` 수 확인.
- H 의 `funding-history.spec.ts` 재실행 실패(오전 실측 7 passed · 1 failed)는 **811b062 에서 고쳐졌다** — `afterEach` 가
  만든 펀딩·Payment 를 지우고, "참여한 것" 단언을 빈 상태 대신 해당 펀딩 링크 0개로. 공유 DB 재실행에서 9/9 확인.
- ⚠️ **좀비 dev 서버 함정 (2026-09-04, 3시간 잃음).** 내가 띄운 `npm run dev` 를 멈춰도 자식 `next dev` 가 :3000 을
  물고 살아남고, Playwright 는 `reuseExistingServer` 로 그걸 계속 쓴다. 그 사이 `npm run build` 가 `.next/` 를
  갈아엎으면 서버 액션이 예외를 던져(친구 해제 → "해제하지 못했어요") 초록이던 스펙 12건이 한꺼번에 빨갛게 된다.
  **E2E 가 대량 실패하면 코드보다 먼저 `netstat -ano | findstr :3000` 과 node.exe 시작 시각을 본다.** 복구는
  node 전부 종료 → Playwright 가 서버를 직접 띄우게. dev 서버가 떠 있는 동안 build 를 돌리지 않는다.
- 참고: H 의 M4 E2E 는 참여 행을 `@/lib/prisma` 로 직접 심는다(`funding-history.spec.ts`). 결제·환불 왕복을
  실제로 밟는 3주체 검증은 `funding-settle.spec.ts` 하나뿐이다 — T033 이 그걸 6/6 으로 완주했다.
- 빌링키 **발급**은 실연동에서 서버가 못 한다(FR-008) — 결제사 인증 창 위젯은 실서비스 전환 몫.
- 키 자리: V2 API Secret → `.env.local` `PORTONE_API_SECRET` / 토스 클라이언트·시크릿 키 → PortOne 콘솔 채널 설정.
