-- C5~C8 — M3 돈이 걸린 불변식 4종 (specs/003 research R4 원문, T006).
-- 애플리케이션 검사만 있는 불변식은 조용히 새고 화면으로는 알 수 없다 — M1 T010 · M2 C3/C4 의 교훈.
-- Prisma 문법으로 CHECK 를 표현할 수 없어 raw SQL 로 넣는다. `db push` 로 만든 DB 에는 없다.
-- 걸렸는지는 tests/integration/gift-constraints.test.ts 가 판정하고, Phase 9(T066)에서
-- pg_constraint 조회로 재확인한다.

-- C5: 대안 금액 상한 — PRD 확정 정책 "최초 요청 금액 이하"의 마지막 방어선 (FR-021).
-- 화면 필터(SCR-M3-13)는 첫 번째 방어선일 뿐이며 둘 다 있어야 한다.
ALTER TABLE "GiftRequest" ADD CONSTRAINT gift_counter_le_requested
  CHECK ("counterAmount" IS NULL OR "counterAmount" <= "requestedAmount");

-- C6: 대안 3필드는 전무 또는 전유 — 반쪽 대안 데이터 금지 (FR-022)
ALTER TABLE "GiftRequest" ADD CONSTRAINT gift_counter_all_or_none
  CHECK ( (("counterProductId" IS NULL)::int + ("counterProductSnapshot" IS NULL)::int
         + ("counterAmount" IS NULL)::int) IN (0, 3) );

-- C7: 자기 자신 금지 (FR-013 ④)
ALTER TABLE "GiftRequest" ADD CONSTRAINT gift_no_self CHECK ("giverId" <> "receiverId");

-- C8: 결제 기록은 정확히 하나의 대상에 연결 (XOR, FR-033).
-- "fundingContributionId" 는 컬럼만 선반영 — FK 는 M4 F1 에서 붙는다 (R4).
ALTER TABLE "Payment" ADD CONSTRAINT payment_exactly_one_target
  CHECK ( ("giftRequestId" IS NOT NULL)::int + ("fundingContributionId" IS NOT NULL)::int = 1 );
