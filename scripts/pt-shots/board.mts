/** PT 요약 보드 — 촬영본을 마일스톤별로 한 장에 편성한다 */
import { chromium } from './lib.mjs'
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

type Shot = { file: string; caption: string }
type Section = { tag: string; title: string; lead: string; shots: Shot[] }

const SECTIONS: Section[] = [
  {
    tag: 'M0',
    title: '시작',
    lead: '소셜 로그인 한 종류로 진입 장벽을 없앴다',
    shots: [
      { file: 'M0-01-랜딩', caption: '랜딩 — 비로그인 첫 화면' },
      { file: 'M0-02-로그인', caption: '로그인 · 가입 — Google 1종' },
    ],
  },
  {
    tag: 'M1',
    title: '맞춤 취향 프로필',
    lead: '"원하는 것 · 이미 있어요 · 관심 없어요" 세 갈래로 취향을 기록한다',
    shots: [
      { file: 'M1-01-온보딩-인트로', caption: '온보딩 — 왜 기록하나' },
      { file: 'M1-02-온보딩-카테고리', caption: '1/3 — 대분류 고르기' },
      { file: 'M1-03-온보딩-종류선택', caption: '2/3 — 어느 쪽인가요' },
      { file: 'M1-04-내취향', caption: '내 취향 — 세 갈래 + 서술' },
      { file: 'M1-05-취향-추천상품', caption: '취향으로 좁힌 상품' },
    ],
  },
  {
    tag: 'M2',
    title: '친구와 취향 공유',
    lead: '링크 하나로 연결하고, 친구의 취향과 일정을 함께 본다',
    shots: [
      { file: 'M2-01-친구목록', caption: '친구 목록' },
      { file: 'M2-02-친구-취향상세', caption: '친구의 취향 · 다가오는 일정' },
      { file: 'M2-03-초대링크', caption: '초대 링크 발급' },
    ],
  },
  {
    tag: 'M3',
    title: '선물 요청과 결제',
    lead: '보내는 사람이 상한을 정하고, 받는 사람이 그 안에서 고른다',
    shots: [
      { file: 'M3-01-상품카탈로그', caption: '상품 카탈로그' },
      { file: 'M3-02-친구맞춤-목록', caption: '관심 없는 종류는 빠진 목록' },
      { file: 'M3-03-상품상세-취향일치', caption: '"원하는 것" 일치 배너' },
      { file: 'M3-04-상품상세-꽃다발', caption: '취향과 겹치지 않는 상품' },
      { file: 'M3-05-선물요청-확인', caption: '요청 확인 1/2' },
      { file: 'M3-06-재결제-동의', caption: '결제 상한 동의 2/2' },
      { file: 'M3-07-받은선물-응답대기', caption: '받는 사람 — 응답 기한' },
      { file: 'M3-08-배송지-입력', caption: '배송지 입력' },
      { file: 'M3-09-다른것도-좋아요', caption: '같은 상한 안에서 다시 고르기' },
      { file: 'M3-10-선물-결과', caption: '확정 결과' },
      { file: 'M3-11-선물내역', caption: '선물 내역' },
    ],
  },
  {
    tag: 'M4',
    title: '함께 모아 선물하기',
    lead: '최소 달성 금액과 지분 공개 범위를 역할별로 나눈다',
    shots: [
      { file: 'M4-01-펀딩개설-대상', caption: '펀딩 개설 — 누구에게' },
      { file: 'M4-02-펀딩상세-주최자', caption: '주최자 — 지분 전체 공개' },
      { file: 'M4-03-펀딩상세-참여자', caption: '참여자 — 내 지분만 공개' },
      { file: 'M4-04-펀딩-참여하기', caption: '참여 금액 입력' },
      { file: 'M4-05-펀딩내역', caption: '펀딩 내역' },
    ],
  },
  {
    tag: '공통',
    title: '허브',
    lead: '일정 · 선물 · 펀딩이 홈 한 화면에서 이어진다',
    shots: [
      { file: 'HUB-01-홈-보내는사람', caption: '홈 — 일정·선물·펀딩' },
      { file: 'HUB-03-알림', caption: '알림' },
      { file: 'HUB-04-마이', caption: '마이' },
      { file: 'HUB-05-결제수단', caption: '결제수단' },
      { file: 'HUB-06-기념일', caption: '기념일 관리' },
    ],
  },
]

const dataUri = (name: string) =>
  'data:image/png;base64,' + readFileSync(resolve('pt-shots', `${name}.png`)).toString('base64')
const logo = 'data:image/png;base64,' + readFileSync(resolve('public/brand/trans_neonjisi_logo_kor.png')).toString('base64')

const card = (s: Shot) => `
  <figure class="shot">
    <div class="frame"><img src="${dataUri(s.file)}" alt=""></div>
    <figcaption>${s.caption}</figcaption>
  </figure>`

const section = (s: Section) => `
  <section class="band">
    <header class="band-head">
      <span class="tag">${s.tag}</span>
      <h2>${s.title}</h2>
      <p>${s.lead}</p>
    </header>
    <div class="grid">${s.shots.map(card).join('')}</div>
  </section>`

const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<style>
  @font-face { font-family: 'Pretendard Variable'; src: url('file:///${resolve('PretendardVariable.ttf').replace(/\\/g, '/')}'); }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  :root {
    --rose-500: #e84d78; --rose-700: #b8325b; --rose-50: #fff1f5;
    --ink: #35262b; --ink-soft: #806b72; --line: #f5e8ec; --app: #fff7f8;
  }
  body {
    font-family: 'Pretendard Variable', -apple-system, 'Malgun Gothic', sans-serif;
    background: var(--app); color: var(--ink); width: 2040px; padding: 72px 64px 80px;
    -webkit-font-smoothing: antialiased;
  }
  .head { display: flex; align-items: flex-end; gap: 28px; padding-bottom: 30px; border-bottom: 3px solid var(--rose-500); }
  .head img { height: 82px; }
  .head .sub { flex: 1; }
  .head h1 { font-size: 40px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.2; }
  .head p { margin-top: 8px; font-size: 20px; color: var(--ink-soft); }
  .head .meta { text-align: right; font-size: 15px; color: var(--ink-soft); line-height: 1.7; }
  .head .meta b { color: var(--rose-700); }

  .band { margin-top: 56px; }
  .band-head { display: flex; align-items: baseline; gap: 16px; margin-bottom: 24px; }
  .tag {
    background: var(--rose-500); color: #fff; font-size: 17px; font-weight: 800;
    padding: 5px 14px; border-radius: 999px; letter-spacing: 0.02em;
  }
  .band-head h2 { font-size: 30px; font-weight: 800; letter-spacing: -0.02em; }
  .band-head p { font-size: 19px; color: var(--ink-soft); }

  .grid { display: flex; flex-wrap: wrap; gap: 26px; }
  .shot { width: 288px; }
  .frame {
    border-radius: 26px; overflow: hidden; background: #fff;
    border: 1px solid var(--line); box-shadow: 0 12px 28px rgba(53,38,43,.10);
  }
  .frame img { display: block; width: 100%; }
  figcaption { margin-top: 12px; font-size: 16px; font-weight: 600; color: var(--ink); line-height: 1.4; }

  .foot { margin-top: 64px; padding-top: 24px; border-top: 1px solid var(--line); font-size: 15px; color: var(--ink-soft); }
</style></head>
<body>
  <div class="head">
    <img src="${logo}" alt="넌지시">
    <div class="sub">
      <h1>화면 흐름 — 마일스톤 M0 → M4</h1>
      <p>받는 사람의 취향을 기록하고 전달해, 원하지 않는 선물을 주고받는 어긋남을 양쪽에서 줄인다</p>
    </div>
    <div class="meta">
      Next.js 16 App Router · TypeScript<br>
      Supabase(PostgreSQL) · Prisma · PortOne<br>
      <b>실제 구동 화면 캡처 · 390×844 @3x</b>
    </div>
  </div>
  ${SECTIONS.map(section).join('')}
  <p class="foot">데모 계정 — 이서준(보내는 사람 · 펀딩 주최자) · 박지우(받는 사람) · 김하늘 · 정민서(펀딩 참여자)</p>
</body></html>`

mkdirSync('.pt-tmp', { recursive: true })
writeFileSync('.pt-tmp/board.html', html, 'utf8')

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 2040, height: 1400 }, deviceScaleFactor: 1 })
await page.setContent(html, { waitUntil: 'load' })
await page.waitForTimeout(2500)
await page.screenshot({ path: 'pt-shots/_요약보드.png', fullPage: true })
await browser.close()
console.log('✅ pt-shots/_요약보드.png')
