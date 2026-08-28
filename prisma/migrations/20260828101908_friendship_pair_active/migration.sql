-- C3 — 같은 쌍의 중복 활성 관계 방지, 순서 무관 (data-model.md, FR-015, research R4).
-- LEAST/GREATEST 표현식이 (A,B) 와 (B,A) 를 같은 키로 정규화하고,
-- WHERE status <> 'REMOVED' 부분 조건이 있어 해제 이력이 재추가를 막지 않는다 (FR-026, R9).
-- 애플리케이션 검사만으로는 동시 요청(두 사람이 서로의 링크를 동시에 여는 Edge Case)에서 새므로
-- DB 가 막는다. Prisma 스키마 문법으로 표현되지 않아 raw SQL 로 넣는다 (T006).
-- 걸렸는지는 tests/integration/friendship-constraints.test.ts (a) 가 판정한다.
CREATE UNIQUE INDEX friendship_pair_active
  ON "Friendship" (LEAST("requesterId", "addresseeId"), GREATEST("requesterId", "addresseeId"))
  WHERE status <> 'REMOVED';
