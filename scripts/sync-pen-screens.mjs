import fs from "node:fs";

const penPath = new URL("../design/neonjisi.pen", import.meta.url);
const pen = JSON.parse(fs.readFileSync(penPath, "utf8"));
let sequence = 0;
const id = () => `SYNC${String(++sequence).padStart(3, "0")}`;

function walk(node, visit) {
  if (!node || typeof node !== "object") return;
  visit(node);
  for (const child of node.children ?? []) walk(child, visit);
}

function text(content, size = "$font-size-14", weight = "$font-weight-regular", color = "$color-text-primary") {
  return {
    type: "text", id: id(), name: content, content, fill: color,
    fontFamily: "$font-body", fontSize: size, fontWeight: weight,
    lineHeight: "$line-height-normal",
  };
}

function card(title, body, badge) {
  const children = [];
  if (badge) children.push(text(badge, "$font-size-12", "$font-weight-semibold", "$color-text-brand"));
  children.push(text(title, "$font-size-16", "$font-weight-bold"));
  if (body) children.push(text(body, "$font-size-14", "$font-weight-regular", "$color-text-secondary"));
  return {
    type: "frame", id: id(), name: `${title} 카드`, width: "fill_container",
    fill: "$color-background-surface", cornerRadius: 20, layout: "vertical",
    gap: "$space-8", padding: "$space-16", children,
  };
}

function button(label, variant = "primary") {
  return {
    id: id(), type: "ref", ref: variant === "primary" ? "c8U1g" : "o829BZ",
    name: label, width: "fill_container", height: 48,
    descendants: variant === "primary" ? { xdcYf: { content: label } } : { v9isES: { content: label } },
  };
}

function screen({ name, title, x, y, children, bottomNav = false }) {
  const content = {
    type: "frame", id: id(), name: `${title} 콘텐츠`, width: "fill_container",
    height: "fill_container", layout: "vertical", gap: "$space-16",
    padding: ["$space-16", "$space-20", "$space-20", "$space-20"], children,
  };
  const nodes = [
    { id: id(), type: "ref", ref: "wnqJ6", name: "Status Bar", width: "fill_container" },
    {
      id: id(), type: "ref", ref: "CPOcQ", name: `${title} Top Bar`, width: "fill_container",
      descendants: { qSAdV: { content: title } },
    },
    content,
  ];
  if (bottomNav) nodes.push({ id: id(), type: "ref", ref: "rrpkH", name: "Bottom Navigation", width: "fill_container" });
  return {
    type: "frame", id: id(), x, y, name, theme: { colorDirection: "rose" },
    clip: true, width: 390, height: 844, fill: "$color-background-default",
    layout: "vertical", children: nodes,
  };
}

// 현재 앱은 TopBar도 페이지와 같은 배경을 사용한다. 구 PEN의 흰 띠를 공통 컴포넌트에서 제거한다.
const topBar = pen.children.find((node) => node.id === "CPOcQ");
if (topBar) topBar.fill = "$color-background-default";

// 비로그인 랜딩을 현재 큰 한글 로고 + Google 진입 구조로 맞춘다.
const landing = pen.children.find((node) => node.id === "rwf2Z");
if (landing) {
  walk(landing, (node) => {
    if (node.name === "Hero" && Array.isArray(node.children)) {
      node.children = [{
        type: "rectangle", id: "SYNCLOGOKOR", name: "넌지시 한글 로고",
        width: 224, height: 224,
        fill: { type: "image", url: "../public/brand/trans_neonjisi_logo_kor.png", mode: "fit" },
      }, text("나를 아는 선물.", "$font-size-16", "$font-weight-regular", "$color-text-secondary")];
    }
    if (node.name === "Actions" && Array.isArray(node.children)) {
      node.children = [
        { id: "SYNCLANDINGGOOGLE", type: "ref", ref: "c8U1g", name: "Google로 시작하기", width: "fill_container", height: 52, descendants: { xdcYf: { content: "Google로 시작하기" } } },
        { id: "SYNCLANDINGLOGIN", type: "ref", ref: "o829BZ", name: "이미 계정이 있어요", width: "fill_container", height: 44, descendants: { v9isES: { content: "이미 계정이 있어요" } } },
      ];
    }
  });
}

// 로그인 화면도 같은 한글 로고를 쓰고 인증 진입은 Google 하나만 노출한다.
const login = pen.children.find((node) => node.id === "cHMdZ");
if (login) {
  walk(login, (node) => {
    if (node.name === "Intro" && Array.isArray(node.children)) {
      node.alignItems = "center";
      node.children = [
        { type: "rectangle", id: "SYNCLOGINLOGO", name: "넌지시 한글 로고", width: 224, height: 180, fill: { type: "image", url: "../public/brand/trans_neonjisi_logo_kor.png", mode: "fit" } },
        ...node.children.filter((child) => child.name === "Headline" || child.name === "Sub"),
      ];
    }
    if (node.name === "Actions" && Array.isArray(node.children)) {
      node.children = [
        { id: "SYNCLOGINGOOGLE", type: "ref", ref: "c8U1g", name: "Google로 계속하기", width: "fill_container", height: 52, descendants: { xdcYf: { content: "Google로 계속하기" } } },
        text("로그인하면 이용약관과 개인정보처리방침에 동의하는 것으로 봅니다.", "$font-size-12", "$font-weight-regular", "$color-text-tertiary"),
      ];
    }
  });
}

// 로그인 홈의 아이콘 + 타이포 로고 락업. 앱과 같은 크기와 음수 간격을 시각적으로 반영한다.
const home = pen.children.find((node) => node.id === "odPRv");
if (home) {
  walk(home, (node) => {
    if (node.id === "CegZ5" && Array.isArray(node.children)) {
      node.children[0] = {
        type: "frame", id: "SYNCLOGOHOME", name: "브랜드 로고 락업", alignItems: "center", gap: -12,
        children: [
          { type: "rectangle", id: "SYNCLOGOICON", name: "아이콘 로고", width: 40, height: 40, fill: { type: "image", url: "../public/brand/trans_neonjisi_logo_icon.png", mode: "fill" } },
          { type: "rectangle", id: "SYNCLOGOTYPO", name: "타이포 로고", width: 96, height: 40, fill: { type: "image", url: "../public/brand/trans_neonjisi_logo_typo.png", mode: "fill" } },
        ],
      };
    }
  });
}

// 최근 구현에서 확정된 문구를 기존 대표 프레임에도 반영한다.
const copyUpdates = new Map([
  ["응답 기다리는 중", "확인이 필요한 선물"],
  ["진행 중 펀딩", "진행 중인 펀딩"],
  ["받은 사람이 바로 친구가 돼요", "받은 사람이 바로 친구가 됩니다."],
]);
for (const frameId of ["odPRv", "gt9gP"]) {
  const frame = pen.children.find((node) => node.id === frameId);
  if (frame) walk(frame, (node) => {
    if (typeof node.content !== "string") return;
    if (copyUpdates.has(node.content)) node.content = copyUpdates.get(node.content);
    node.content = node.content.replace("받은 사람이 바로 친구가 돼요", "받은 사람이 바로 친구가 됩니다.");
  });
}

const additions = [
  screen({ name: "CURRENT · M2 · 일정 관리", title: "일정", x: 5290, y: 16880, children: [
    button("일정 추가"), card("민지 생일", "2026-09-18 · 매년", "생일"), card("부모님 결혼기념일", "2026-10-03 · 매년", "기념일"),
  ] }),
  screen({ name: "CURRENT · M3 · 알림 목록", title: "알림", x: 6166, y: 16880, children: [
    text("모두 읽음", "$font-size-14", "$font-weight-semibold", "$color-text-brand"), card("민지님이 선물 요청을 확인했어요", "방금 전", "읽지 않음"), card("함께 준비한 펀딩이 성사됐어요", "10분 전"), card("서연님과 친구가 되었어요", "어제"),
  ] }),
  screen({ name: "CURRENT · M3 · 받을 친구 선택", title: "받을 친구 선택", x: 6604, y: 16880, children: [
    text("핸드드립 세트을(를) 받을 친구를 선택해주세요.", "$font-size-14", "$font-weight-regular", "$color-text-secondary"), card("김민지", "친구"), card("이서연", "친구"), card("박지훈", "친구"),
  ] }),
  screen({ name: "CURRENT · M3 · 선물 전송 완료", title: "전송 완료", x: 7042, y: 16880, children: [
    { type: "icon", id: id(), name: "완료", width: 64, height: 64, icon: "circle-check", library: "lucide", fill: "$color-success-500" },
    text("요청을 보냈습니다", "$font-size-20", "$font-weight-bold"), text("친구가 24시간 안에 받을지 선택할 수 있어요.", "$font-size-14", "$font-weight-regular", "$color-text-secondary"), button("홈으로"),
  ] }),
  screen({ name: "CURRENT · M3 · 결제 복구", title: "결제 실패", x: 7480, y: 16880, children: [
    { type: "icon", id: id(), name: "경고", width: 56, height: 56, icon: "circle-alert", library: "lucide", fill: "$color-error-500" },
    text("결제가 되지 않았어요", "$font-size-20", "$font-weight-bold"), text("결제수단을 확인하고 다시 시도해주세요.", "$font-size-14", "$font-weight-regular", "$color-text-secondary"), card("등록 카드", "•••• 1234"), button("다시 결제하기"), button("결제수단 변경", "tertiary"),
  ] }),
  screen({ name: "CURRENT · M1 · 원하는 상품 고르기", title: "원하는 상품 고르기", x: 7918, y: 16880, children: [
    text("원하는 상품을 골라 취향에 추가하세요.", "$font-size-14", "$font-weight-regular", "$color-text-secondary"), card("핸드드립 세트", "89,000원", "커피"), card("러닝 벨트", "45,000원", "운동"), card("우디 향 디퓨저", "39,000원", "향"),
  ] }),
  screen({ name: "CURRENT · M4 · 펀딩 취소 결과", title: "펀딩 결과", x: 8356, y: 16880, children: [
    { type: "icon", id: id(), name: "취소", width: 64, height: 64, icon: "circle-x", library: "lucide", fill: "$color-text-secondary" },
    text("주최자가 펀딩을 취소했어요", "$font-size-20", "$font-weight-bold"), text("참여한 금액은 전액 환불됩니다. 카드사에 따라 영업일 3~5일이 걸릴 수 있어요.", "$font-size-14", "$font-weight-regular", "$color-text-secondary"), button("펀딩 내역 보기"),
  ] }),
  {
    type: "frame", id: id(), x: 8794, y: 16880, name: "CURRENT · M2 · 친구 목록",
    theme: { colorDirection: "rose" }, clip: true, width: 390, height: 844,
    fill: "$color-background-default", layout: "vertical", children: [
      { id: id(), type: "ref", ref: "wnqJ6", name: "Status Bar", width: "fill_container" },
      {
        type: "frame", id: id(), name: "친구 Top Bar", width: "fill_container", height: 56,
        padding: [0, "$space-8"], alignItems: "center", children: [
          { type: "rectangle", id: id(), name: "아이콘 로고", width: 40, height: 40, fill: { type: "image", url: "../public/brand/trans_neonjisi_logo_icon.png", mode: "fill" } },
          { type: "text", id: id(), name: "친구", content: "친구", width: "fill_container", textGrowth: "fixed-width", textAlign: "center", fill: "$color-text-primary", fontFamily: "$font-body", fontSize: "$font-size-16", fontWeight: "$font-weight-semibold" },
          { type: "frame", id: id(), name: "친구 추가", width: 40, height: 40, justifyContent: "center", alignItems: "center", children: [
            { type: "icon", id: id(), name: "친구 추가 아이콘", width: 24, height: 24, icon: "plus", library: "lucide", fill: "$color-text-brand" },
          ] },
        ],
      },
      {
        type: "frame", id: id(), name: "친구 콘텐츠", width: "fill_container", height: "fill_container",
        layout: "vertical", gap: "$space-16", padding: ["$space-16", "$space-20", "$space-20", "$space-20"], children: [
          text("다가오는 친구 일정", "$font-size-16", "$font-weight-bold"),
          card("민지 생일", "2026-09-18 · D-13", "다가오는 일정"),
          text("친구 3명", "$font-size-16", "$font-weight-bold"),
          {
            type: "frame", id: id(), name: "친구 목록", width: "fill_container", fill: "$color-background-surface",
            cornerRadius: 20, layout: "vertical", padding: ["$space-4", "$space-16"], children: [
              card("김민지", "커피 · 우디 향 · 러닝"),
              card("이서연", "향수 · 독서"),
              card("박지훈", "운동 · 게임"),
            ],
          },
        ],
      },
      { id: id(), type: "ref", ref: "rrpkH", name: "친구 탭 Bottom Navigation", width: "fill_container" },
    ],
  },
];

const additionNames = new Set(additions.map((node) => node.name));
pen.children = pen.children.filter((node) => !additionNames.has(node.name));
pen.children.push(...additions);

fs.writeFileSync(penPath, `${JSON.stringify(pen, null, 2)}\n`);
