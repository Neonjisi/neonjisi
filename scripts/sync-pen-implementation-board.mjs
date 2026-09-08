import fs from "node:fs";

const penPath = new URL("../design/neonjisi.pen", import.meta.url);
const pen = JSON.parse(fs.readFileSync(penPath, "utf8"));

// 초대 링크 관리 정본은 JTmoE 하나다. 초기 자동 생성본(SYNC028)과 지난 링크 묶음은 제거한다.
pen.children = pen.children.filter((node) => node.id !== "SYNC028");
const inviteManage = pen.children.find((node) => node.id === "JTmoE");
if (inviteManage) {
  inviteManage.name = "CURRENT · M2 · 초대 링크 관리 · /friends/invite/manage";
  const content = inviteManage.children?.find((node) => node.id === "sAb5V");
  if (content?.children) content.children = content.children.filter((node) => node.id !== "X4pR22");
}

const BOARD_ID = "IMPLBOARD0908";
const BOARD_NAME = "IMPLEMENTED · 현재 구현 화면 보드 · 2026-09-08";

const groups = [
  {
    label: "M0 · 시작",
    shots: [
      ["M0-01", "랜딩", "M0-01-랜딩.png"],
      ["M0-02", "로그인", "M0-02-로그인.png"],
    ],
  },
  {
    label: "M1 · 맞춤 취향 프로필",
    shots: [
      ["M1-01", "온보딩 인트로", "M1-01-온보딩-인트로.png"],
      ["M1-02", "온보딩 카테고리", "M1-02-온보딩-카테고리.png"],
      ["M1-03", "온보딩 종류 선택", "M1-03-온보딩-종류선택.png"],
      ["M1-04", "내 취향", "M1-04-내취향.png"],
      ["M1-05", "취향 추천 상품", "M1-05-취향-추천상품.png"],
    ],
  },
  {
    label: "M2 · 친구와 취향 공유",
    shots: [
      ["M2-01", "친구 목록", "M2-01-친구목록.png"],
      ["M2-02", "친구 취향 상세", "M2-02-친구-취향상세.png"],
      ["M2-03", "초대 링크", "M2-03-초대링크.png"],
    ],
  },
  {
    label: "M3 · 선물 요청과 결제",
    shots: [
      ["M3-01", "상품 카탈로그", "M3-01-상품카탈로그.png"],
      ["M3-02", "친구 맞춤 목록", "M3-02-친구맞춤-목록.png"],
      ["M3-03", "상품 상세 · 취향 일치", "M3-03-상품상세-취향일치.png"],
      ["M3-04", "상품 상세 · 일반", "M3-04-상품상세-꽃다발.png"],
      ["M3-05", "선물 요청 확인", "M3-05-선물요청-확인.png"],
      ["M3-06", "재결제 동의", "M3-06-재결제-동의.png"],
      ["M3-07", "받은 선물 응답 대기", "M3-07-받은선물-응답대기.png"],
      ["M3-08", "배송지 입력", "M3-08-배송지-입력.png"],
      ["M3-09", "다른 것도 좋아요", "M3-09-다른것도-좋아요.png"],
      ["M3-10", "선물 결과", "M3-10-선물-결과.png"],
      ["M3-11", "선물 내역", "M3-11-선물내역.png"],
    ],
  },
  {
    label: "M4 · 함께 모아 선물하기",
    shots: [
      ["M4-01", "펀딩 개설 대상", "M4-01-펀딩개설-대상.png"],
      ["M4-02", "펀딩 상세 · 주최자", "M4-02-펀딩상세-주최자.png"],
      ["M4-03", "펀딩 상세 · 참여자", "M4-03-펀딩상세-참여자.png"],
      ["M4-04", "펀딩 참여하기", "M4-04-펀딩-참여하기.png"],
      ["M4-05", "펀딩 내역", "M4-05-펀딩내역.png"],
    ],
  },
  {
    label: "HUB · 공통 화면",
    shots: [
      ["HUB-01", "홈 · 보내는 사람", "HUB-01-홈-보내는사람.png"],
      ["HUB-03", "알림", "HUB-03-알림.png"],
      ["HUB-04", "마이", "HUB-04-마이.png"],
      ["HUB-05", "결제수단", "HUB-05-결제수단.png"],
      ["HUB-06", "기념일", "HUB-06-기념일.png"],
    ],
  },
];

const children = [];
let cursorY = 100;
let sequence = 0;

for (const group of groups) {
  children.push({
    type: "text",
    id: `IMPLTITLE${String(++sequence).padStart(2, "0")}`,
    x: 24,
    y: cursorY,
    name: group.label,
    content: group.label,
    fill: "$color-text-primary",
    fontFamily: "$font-body",
    fontSize: "$font-size-24",
    fontWeight: "$font-weight-bold",
  });

  cursorY += 52;
  group.shots.forEach(([code, title, file], index) => {
    const column = index % 6;
    const row = Math.floor(index / 6);
    children.push({
      type: "frame",
      id: `IMPL${code.replace("-", "")}`,
      x: 24 + column * 438,
      y: cursorY + row * 900,
      name: `IMPLEMENTED · ${code} · ${title}`,
      clip: true,
      width: 390,
      height: 844,
      fill: {
        type: "image",
        url: `../pt-shots/${file}`,
        mode: "fill",
      },
    });
  });

  cursorY += Math.ceil(group.shots.length / 6) * 900 + 72;
}

const board = {
  type: "frame",
  id: BOARD_ID,
  x: 4852,
  y: 18000,
  name: BOARD_NAME,
  clip: false,
  width: 2680,
  height: cursorY + 24,
  fill: "$color-background-default",
  layout: "none",
  children,
};

pen.children = pen.children.filter((node) => node.id !== BOARD_ID && node.name !== BOARD_NAME);
pen.children.push(board);
fs.writeFileSync(penPath, `${JSON.stringify(pen, null, 2)}\n`);
