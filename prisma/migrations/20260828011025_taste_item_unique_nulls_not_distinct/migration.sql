-- C2 — (profileId, kind, categoryId, detail) 중복 금지 (data-model.md, FR-011).
-- PostgreSQL 은 기본적으로 유니크 인덱스에서 NULL 을 서로 다른 값으로 취급하므로(R3),
-- NULLS NOT DISTINCT 없이는 detail 을 비운 항목(가장 흔한 형태)이 무제한 중복된다.
-- Prisma 스키마 문법으로 표현되지 않아 raw SQL 로 넣는다 (T010).
ALTER TABLE "TasteItem"
  ADD CONSTRAINT "TasteItem_profile_kind_category_detail_key"
  UNIQUE NULLS NOT DISTINCT ("profileId", "kind", "categoryId", "detail");
