-- categories.md 확정(2026-08-28) — 묶음(group)은 DB에 넣지 않는다는 결정에 따라
-- 20260828024013_category_group 에서 추가했던 컬럼을 제거한다.
-- 표시용 필드였고 참조 관계가 없으므로 데이터 손실 영향은 없다.
ALTER TABLE "Category" DROP COLUMN "group";
