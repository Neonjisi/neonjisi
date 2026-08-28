-- C4 — 자기 자신과의 친구 관계 금지 (data-model.md, FR-016).
-- 애플리케이션에서도 막지만 DB 제약을 함께 둔다 — 애플리케이션 검사만 있는 불변식은
-- 조용히 새고, 새는 것을 화면으로는 알 수 없다 (M1 T010 의 교훈). Prisma 는 CHECK 를
-- 표현하지 못하므로 raw SQL 로 넣는다 (T007).
-- 걸렸는지는 tests/integration/friendship-constraints.test.ts (b) 가 판정한다.
ALTER TABLE "Friendship"
  ADD CONSTRAINT friendship_not_self CHECK ("requesterId" <> "addresseeId");
