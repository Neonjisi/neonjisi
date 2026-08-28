/**
 * 디자인 작업용 목업 데이터.
 * API·DB 연동 시 lib/dal/* 조회 결과로 교체한다 — 타입 형태는 prisma 모델과 맞춘다.
 */

export type TasteKind = "WANT" | "HAVE" | "UNWANTED";

export interface CategoryMock {
  id: string;
  name: string;
}

export interface TasteItemMock {
  id: string;
  kind: TasteKind;
  categoryId: string;
  categoryName: string;
  detail: string | null;
  memo: string | null;
}

export const MOCK_CATEGORIES: CategoryMock[] = [
  "텀블러",
  "향수",
  "머그컵",
  "지갑",
  "양말",
  "다이어리",
  "키링",
  "핸드크림",
  "무선이어폰",
  "블루투스스피커",
  "커피용품",
  "캔들",
  "디퓨저",
  "에코백",
  "보조배터리",
  "우산",
  "머플러",
  "장갑",
  "북엔드",
  "꽃",
].map((name, index) => ({ id: `cat-${index + 1}`, name }));

export const MOCK_TASTE_ITEMS: TasteItemMock[] = [
  {
    id: "item-1",
    kind: "WANT",
    categoryId: "cat-11",
    categoryName: "커피용품",
    detail: "핸드드립 케틀",
    memo: "요즘 커피에 빠졌어요",
  },
  {
    id: "item-2",
    kind: "WANT",
    categoryId: "cat-11",
    categoryName: "커피용품",
    detail: "원두 정기구독",
    memo: null,
  },
  {
    id: "item-3",
    kind: "HAVE",
    categoryId: "cat-1",
    categoryName: "텀블러",
    detail: "스타벅스 텀블러",
    memo: "이미 3개 있어요",
  },
  {
    id: "item-4",
    kind: "HAVE",
    categoryId: "cat-3",
    categoryName: "머그컵",
    detail: null,
    memo: null,
  },
  {
    id: "item-5",
    kind: "UNWANTED",
    categoryId: "cat-4",
    categoryName: "지갑",
    detail: null,
    memo: "최근에 새로 샀어요",
  },
];

export const MOCK_DESCRIPTION =
  "아침에 혼자 커피 내리는 15분이 좋아요. 산미 있는 원두를 주로 마셔요.";

export const MOCK_USER = {
  name: "김지은",
  tasteCount: 8,
  friendCount: 5,
};
