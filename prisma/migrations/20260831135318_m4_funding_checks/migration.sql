-- C9·C10 — M4 돈이 걸린 불변식 2종 + Payment FK 회수 (specs/004 research R4 원문, T007).
-- 애플리케이션 검사만 있는 불변식은 조용히 새고 화면으로는 알 수 없다 — M1 T010 · M2 C3/C4 ·
-- M3 C5~C8 의 교훈. Prisma 문법으로 CHECK 를 표현할 수 없어 raw SQL 로 넣는다.
-- `db push` 로 만든 DB 에는 없다. 걸렸는지는 tests/integration/funding-constraints.test.ts 가
-- 판정하고, Phase 7(T039)에서 pg_constraint 조회로 재확인한다.

-- C9: 달성선 상한 — minAmount 는 goalAmount 를 넘을 수 없다 (FR-002).
ALTER TABLE "Funding" ADD CONSTRAINT funding_min_le_goal
  CHECK ("minAmount" <= "goalAmount");

-- C10: 개설자 = 수령자면 차액 개념 소멸 (확정 결정 5-5, FR-003) — 화면(달성선 잠금)은
-- 첫 방어선, 이 CHECK 가 마지막 방어선이다.
ALTER TABLE "Funding" ADD CONSTRAINT funding_self_full_goal
  CHECK ("organizerId" <> "receiverId" OR "minAmount" = "goalAmount");

-- M3 R4 가 선반영한 컬럼(Payment.fundingContributionId)에 FK 를 붙인다. C8(XOR, M3)은
-- 이미 걸려 있으므로 이 FK 만 추가하면 결제 데이터의 참조 무결성이 완성된다 (FR-006).
ALTER TABLE "Payment" ADD CONSTRAINT payment_funding_contribution_fk
  FOREIGN KEY ("fundingContributionId") REFERENCES "FundingContribution"("id");
