import fs from "node:fs";

const penPath = new URL("../design/neonjisi.pen", import.meta.url);
const pen = JSON.parse(fs.readFileSync(penPath, "utf8"));
const FRAME_ID = "PRODUCTSFRIENDWANTS";

const text = (id, name, content, x, y, fontSize = 14, fontWeight = "500", fill = "$color-text-primary") => ({
  type: "text", id, name, content, x, y, fill,
  fontFamily: "$font-body", fontSize, fontWeight,
});

const field = (id, name, value, x, width) => ({
  type: "frame", id, name, x, y: 158, width, height: 44,
  fill: "$color-background-surface", cornerRadius: 14,
  stroke: "$color-border-default", strokeWidth: 1,
  children: [
    text(`${id}TXT`, `${name} 값`, value, 14, 12, 14, "500"),
    { type: "icon", id: `${id}CHEV`, name: `${name} 펼치기`, x: width - 28, y: 14, width: 16, height: 16, iconFontFamily: "lucide", iconFontName: "chevron-down", fill: "$color-text-primary" },
  ],
});

const frame = {
  type: "frame", id: FRAME_ID, name: "/products?for=[userId] · 친구 필터 · 원하는 선물 표시",
  x: 10108, y: 14472, width: 390, height: 844,
  fill: "$color-background-default", clip: true, layout: "none",
  children: [
    { type: "ref", id: "PFWHEADER", ref: "BonMy", name: "App Header", x: 0, y: 0, width: 390, height: 80 },
    { type: "frame", id: "PFWSEARCH", name: "상품 검색", x: 20, y: 94, width: 350, height: 48,
      fill: "$color-background-surface", cornerRadius: 16, stroke: "$color-border-default", strokeWidth: 1,
      children: [
        { type: "icon", id: "PFWSEARCHICON", name: "검색", x: 14, y: 14, width: 20, height: 20, iconFontFamily: "lucide", iconFontName: "search", fill: "$color-text-secondary" },
        text("PFWSEARCHTXT", "검색 안내", "어떤 선물을 찾으세요?", 44, 15, 14, "500", "$color-text-tertiary"),
      ] },
    field("PFWCATEGORY", "카테고리 필터", "전체 카테고리", 20, 169),
    field("PFWFRIEND", "친구 필터", "Docu Re", 197, 173),
    { type: "frame", id: "PFWAPPLY", name: "검색·필터 적용", x: 20, y: 216, width: 350, height: 44,
      fill: "$color-neutral-900", cornerRadius: 14, justifyContent: "center", alignItems: "center",
      children: [text("PFWAPPLYTXT", "버튼 문구", "검색·필터 적용", 0, 0, 14, "600", "$color-text-inverse")] },
    { type: "frame", id: "PFWWANTS", name: "친구가 원하는 선물 카드", x: 20, y: 276, width: 350, height: 154,
      fill: "$color-background-brand-subtle", cornerRadius: 18, layout: "none",
      children: [
        text("PFWWANTSTITLE", "카드 제목", "Docu Re님이 원하는 선물", 16, 16, 15, "700"),
        { type: "frame", id: "PFWWANTCHIP1", name: "원하는 항목", x: 16, y: 50, height: 32,
          fill: "$color-background-surface", cornerRadius: 999, padding: [7, 12],
          children: [text("PFWWANTTXT1", "원하는 항목명", "스테인리스 텀블러", 0, 0, 13, "600", "$color-text-brand")] },
        { type: "frame", id: "PFWWANTCHIP2", name: "원하는 항목", x: 158, y: 50, height: 32,
          fill: "$color-background-surface", cornerRadius: 999, padding: [7, 12],
          children: [text("PFWWANTTXT2", "원하는 항목명", "머그컵", 0, 0, 13, "600", "$color-text-brand")] },
        text("PFWWANTSNOTE", "제외 안내", "관심 없다고 한 종류는 상품 목록에서 제외했어요.", 16, 104, 12, "500", "$color-text-secondary"),
      ] },
    text("PFWRESULTTITLE", "상품 결과 수", "상품 2개", 20, 456, 18, "700"),
    { type: "frame", id: "PFWPRODUCTS", name: "필터 상품 결과", x: 20, y: 492, width: 350, gap: 12,
      children: [
        { type: "ref", id: "PFWPRODUCT1", ref: "HKaZp", name: "텀블러 상품 1", width: "fill_container" },
        { type: "ref", id: "PFWPRODUCT2", ref: "f1Rd3p", name: "텀블러 상품 2", width: "fill_container" },
      ] },
    { type: "ref", id: "PFWFOOTER", ref: "uPiBq", name: "App Footer", x: 0, y: 780, width: 390, height: 64 },
  ],
};

pen.children = pen.children.filter((node) => node.id !== FRAME_ID && node.id !== "PRODUCTSFILTERED");
pen.children.push(frame);
fs.writeFileSync(penPath, `${JSON.stringify(pen, null, 2)}\n`);
