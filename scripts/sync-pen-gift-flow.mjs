import fs from "node:fs";

const penPath = new URL("../design/neonjisi.pen", import.meta.url);
const pen = JSON.parse(fs.readFileSync(penPath, "utf8"));
const BOARD_ID = "GIFTFLOWBOARD";
const RECEIVED_HISTORY_ID = "GIFTRECEIVEDHISTORY";

pen.children = pen.children.filter((node) => node.id !== BOARD_ID && node.id !== RECEIVED_HISTORY_ID);

const screens = [
  ["v2dyL", "/products", "상품 목록"],
  ["OkbII", "/products/for/[userId]", "친구 맞춤 추천"],
  ["bkvyK", "/products/[id]", "상품 상세"],
  ["SYNC057", "/products/[id]/receiver", "받을 친구 선택"],
  ["g6mJ1K", "/gifts/new", "선물 요청 확인"],
  ["oICzt", "/gifts/new/consent", "결제 동의"],
  ["SYNC065", "/gifts/new/done", "전송 완료"],
  ["iIa5m", "/gifts/[id]", "받은 선물 응답"],
  ["XWEgZ", "/gifts/[id]/respond/reselect", "다른 선물 고르기"],
  ["hFzVB", "/gifts/[id]/respond/shipping", "배송지 입력"],
  ["Ykmf1", "/gifts/[id]/result", "선물 결과 · 성공"],
  ["L5BCG2", "/gifts/[id]/recover", "결제 실패 · 복구"],
  ["YQOYl", "/gifts/[id]", "보낸 선물 상세"],
  ["FW0qV", "/my/gifts", "보낸 선물 내역", "sent"],
  ["FW0qV", "/my/gifts?tab=received", "받은 선물 내역", "received"],
];

const sourceById = new Map(pen.children.filter((node) => node.id).map((node) => [node.id, node]));
let sequence = 0;

function changedGiftCard(prefix, mode) {
  const text = (id, name, content, size = 13, weight = "500", fill = "$color-text-primary") => ({
    type: "text", id: `${prefix}${id}`, name, content, fill,
    fontFamily: "$font-body", fontSize: size, fontWeight: weight,
  });
  const productRow = (suffix, label, product, price, fill) => ({
    type: "frame", id: `${prefix}ROW${suffix}`, name: label,
    width: "fill_container", gap: 12, alignItems: "center",
    children: [
      { type: "rectangle", id: `${prefix}IMG${suffix}`, name: `${label} 이미지`, width: 56, height: 56, cornerRadius: 12, fill },
      { type: "frame", id: `${prefix}INFO${suffix}`, name: `${label} 정보`, width: "fill_container", layout: "vertical", gap: 3,
        children: [
          text(`LABEL${suffix}`, `${label} 라벨`, label, 11, "600", "$color-text-secondary"),
          text(`NAME${suffix}`, `${label} 상품명`, product, 14, "600"),
          text(`PRICE${suffix}`, `${label} 가격`, price, 12, "500", "$color-text-secondary"),
        ] },
    ],
  });
  return {
    type: "frame", id: `${prefix}CARD`, name: "받은 선물 · 상품 변경 비교",
    width: "fill_container", fill: "$color-background-surface", cornerRadius: 18,
    effect: { type: "shadow", shadowType: "outer", color: "$color-shadow", offset: { x: 0, y: 6 }, blur: 16 },
    layout: "vertical", gap: 12, padding: 14,
    children: [
      { type: "frame", id: `${prefix}HEAD`, name: "카드 제목", width: "fill_container", justifyContent: "space_between", alignItems: "center",
        children: [
          text("TITLE", "상대 이름", mode === "sent" ? "이서연님에게 보낸 선물" : "김민수님에게 받은 선물", 14, "600"),
          { type: "frame", id: `${prefix}BADGE`, name: "선물 변경 배지", fill: "$color-info-50", cornerRadius: 8, padding: [3, 8],
            children: [text("BADGETXT", "배지 문구", "선물 변경", 11, "600", "$color-info-700")] },
        ] },
      productRow("OLD", "기존 선택 선물", "원두 정기구독", "60,000원", "$color-butter"),
      { type: "rectangle", id: `${prefix}DIV`, name: "상품 구분선", width: "fill_container", height: 1, fill: "$color-border-default" },
      productRow("NEW", "변경한 선물", "핸드드립 케틀", "48,000원", "$color-mint-100"),
    ],
  };
}

function updateGiftHistoryFrame(frame, prefix, mode) {
  if (!frame) return;
  frame.name = mode === "sent" ? "/my/gifts · 보낸 선물 내역" : "/my/gifts?tab=received · 받은 선물 내역";
  const tab = (frame.children ?? []).find((node) => node.name === "Tab Bar");
  if (tab?.descendants) {
    const sent = mode === "sent";
    tab.descendants.wyggN = { ...(tab.descendants.wyggN ?? {}), fill: sent ? "$color-text-brand" : "$color-text-tertiary" };
    tab.descendants.eQDWB = { ...(tab.descendants.eQDWB ?? {}), fill: sent ? "$color-background-brand" : "#00000000" };
    tab.descendants.mniOa = { ...(tab.descendants.mniOa ?? {}), fill: sent ? "$color-text-tertiary" : "$color-text-brand" };
    tab.descendants.ceqLs = { ...(tab.descendants.ceqLs ?? {}), fill: sent ? "#00000000" : "$color-background-brand" };
  }
  const past = (frame.children ?? []).flatMap((node) => node.children ?? []).find((node) => node.name === "지난 선물");
  const items = (past?.children ?? []).find((node) => node.name === "Items");
  if (!items) return;
  const card = changedGiftCard(prefix, mode);
  const changedIndex = items.children.findIndex((node) => node.name === "이서연 · 원두 정기구독" || node.name === "받은 선물 · 상품 변경 비교");
  if (changedIndex >= 0) items.children.splice(changedIndex, 1, card);
  else items.children.unshift(card);
}

updateGiftHistoryFrame(sourceById.get("FW0qV"), "PHSENT", "sent");

const receivedHistory = cloneWithFreshIds(sourceById.get("FW0qV"));
receivedHistory.id = RECEIVED_HISTORY_ID;
receivedHistory.x = 9232;
receivedHistory.y = 10890;
updateGiftHistoryFrame(receivedHistory, "PHRECEIVED", "received");

function cloneWithFreshIds(source) {
  const cloned = structuredClone(source);
  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (node.id) node.id = `GF${String(++sequence).padStart(5, "0")}`;
    for (const child of node.children ?? []) visit(child);
  }
  visit(cloned);
  return cloned;
}

const children = [
  {
    type: "text", id: "GIFTFLOWTITLE", x: 24, y: 24,
    name: "상품 선택 이후 선물하기 흐름", content: "상품 선택 이후 선물하기 흐름",
    fill: "$color-text-primary", fontFamily: "$font-body",
    fontSize: "$font-size-28", fontWeight: "$font-weight-bold",
  },
  {
    type: "text", id: "GIFTFLOWSUB", x: 24, y: 68,
    name: "Flow description",
    content: "보내는 사람 1~7 → 받는 사람 8~12 → 상세·보낸 내역·받은 내역 13~15",
    fill: "$color-text-secondary", fontFamily: "$font-body",
    fontSize: "$font-size-14", fontWeight: "$font-weight-regular",
  },
];

for (const [index, [sourceId, route, title, historyMode]] of screens.entries()) {
  const source = sourceById.get(sourceId);
  if (!source) throw new Error(`PEN source frame missing: ${sourceId}`);
  const column = index % 5;
  const row = Math.floor(index / 5);
  const x = 24 + column * 438;
  const y = 144 + row * 920;
  const frame = cloneWithFreshIds(source);
  frame.x = x;
  frame.y = y;
  frame.name = `CURRENT · ${index + 1} · ${route} · ${title}`;
  if (sourceId === "FW0qV") updateGiftHistoryFrame(frame, `PHFLOW${historyMode === "sent" ? "SENT" : "RECEIVED"}`, historyMode);
  frame.name = `CURRENT · ${index + 1} · ${route} · ${title}`;
  children.push(frame);
}

const board = {
  type: "frame", id: BOARD_ID, x: 4852, y: 25400,
  name: "CURRENT · 상품 선택 이후 선물하기 흐름",
  clip: false, width: 2240, height: 2928,
  fill: "$color-background-default", layout: "none", children,
};

pen.children.push(receivedHistory);
pen.children.push(board);
fs.writeFileSync(penPath, `${JSON.stringify(pen, null, 2)}\n`);
