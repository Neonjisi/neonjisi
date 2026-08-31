/**
 * T012 — Category 시드 + T008 — Product 시드. `npx prisma db seed` 로 실행한다.
 *
 * [Category] 목록의 원본(SSOT)은 specs/001-taste-profile/categories.md §4 — S(기획) 확정안 40개다.
 * name 을 키로 upsert 하므로 몇 번을 돌려도 결과가 같다 (멱등).
 * 순서 변경은 배열 순서만 바꾸면 되고, 목록에서 빠진 항목은 지우지 않는다 —
 * 이미 취향이 참조 중인 카테고리는 FK Restrict 로 삭제가 막혀 있다.
 *
 * ⚠️ name 은 unique 키다. 가운뎃점(·)·띄어쓰기까지 문서와 정확히 일치해야 한다 —
 *    오타 하나가 중복 행이 된다. 묶음은 순서에만 반영되고 DB에는 저장하지 않는다.
 *
 * [Product] 콘텐츠의 원본(SSOT)은 S의 시드 표(tasks.md T002, 마감: Phase 3 시작 전)다.
 * 표가 확정되면 PRODUCT_SEED 배열에 그대로 옮긴다 — 여기 코드는 바꿀 필요가 없다.
 * name 으로 찾아 갱신/생성하므로 멱등이다. 시나리오 커버 4조건(spec Assumptions —
 * want 일치 · have · unwanted · 싼 대안 여러 건)은 주입 후 리포트로 확인을 돕고,
 * 최종 판정은 quickstart V1~V8 수동 검증(T069, S 주도)이 한다.
 */
import { loadEnvConfig } from '@next/env'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

// prisma CLI 를 거치지 않고 직접 실행해도 .env.local 을 읽도록 한다.
loadEnvConfig(process.cwd())

// categories.md §4 확정 순서 그대로. 배열 순서 = sortOrder = 화면 순서.
const CATEGORY_NAMES: string[] = [
  // 리빙
  '텀블러',
  '머그컵·유리컵',
  '디퓨저·캔들',
  '수건',
  '침구',
  '그릇·식기',
  // 뷰티
  '핸드크림',
  '립밤·립스틱',
  '향수',
  '바디케어',
  '스킨케어',
  '헤어케어',
  // 패션·잡화
  '양말',
  '머플러·장갑',
  '지갑',
  '주얼리',
  '가방',
  '모자',
  '잠옷·홈웨어',
  // 교환권
  '커피 교환권',
  '편의점 교환권',
  '치킨·피자 교환권',
  '아이스크림·디저트 교환권',
  // 식품
  '케이크',
  '초콜릿·쿠키',
  '과일 선물세트',
  '한우·정육 선물세트',
  '차·티백',
  // 건강
  '비타민·영양제',
  '홍삼·건강기능식품',
  // 디지털
  '무선이어폰',
  '보조배터리·충전기',
  '스마트워치',
  // 주류
  '와인',
  '위스키·전통주',
  // 생활·취미
  '책',
  '꽃다발·화분',
  '운동용품',
  '반려동물 용품',
  '유아동 용품',
]

// ── Product 시드 (T008) ──────────────────────────────────────────────────────

type ProductSeed = {
  name: string
  /** CATEGORY_NAMES 의 값과 정확히 일치해야 한다 — 불일치는 주입 시 즉시 실패한다 */
  category: string
  /** 원 단위 정수 (data-model Product.price) */
  price: number
  imageUrl: string | null
}

/**
 * ⛔ 콘텐츠는 S의 표(T002)가 SSOT 다 — 확정 전 임의 콘텐츠를 넣지 않는다 (팀원 산출물).
 * 표가 오면 행을 그대로 옮긴다. 30~50건 + 시나리오 커버 4조건은 아래 리포트가 확인을 돕는다.
 */
const PRODUCT_SEED: ProductSeed[] = []

async function seedProducts(prisma: PrismaClient): Promise<void> {
  if (PRODUCT_SEED.length === 0) {
    process.stdout.write(
      'Product 시드 생략 — S의 표(T002) 미전달. 확정되면 PRODUCT_SEED 에 옮겨 다시 실행한다.\n',
    )
    return
  }
  if (PRODUCT_SEED.length < 30 || PRODUCT_SEED.length > 50) {
    throw new Error(
      `Product 시드는 30~50건이어야 한다 (spec Assumptions) — 현재 ${PRODUCT_SEED.length}건`,
    )
  }

  const categories = await prisma.category.findMany({ select: { id: true, name: true } })
  const categoryIdByName = new Map(categories.map((c) => [c.name, c.id]))

  for (const item of PRODUCT_SEED) {
    const categoryId = categoryIdByName.get(item.category)
    if (!categoryId) {
      // 오타를 조용히 넘기면 unwanted 필터·매칭 배너가 그 상품에서 전부 빗나간다
      throw new Error(`Product "${item.name}" 의 카테고리 "${item.category}" 가 Category 시드에 없다`)
    }
    if (!Number.isInteger(item.price) || item.price <= 0) {
      throw new Error(`Product "${item.name}" 의 가격이 원 단위 양의 정수가 아니다: ${item.price}`)
    }

    // name 은 unique 제약이 없으므로 upsert 대신 찾아서 갱신/생성한다 — 멱등
    const existing = await prisma.product.findFirst({ where: { name: item.name }, select: { id: true } })
    const data = { name: item.name, categoryId, price: item.price, imageUrl: item.imageUrl, isActive: true }
    if (existing) {
      await prisma.product.update({ where: { id: existing.id }, data })
    } else {
      await prisma.product.create({ data })
    }
  }

  const count = await prisma.product.count({ where: { isActive: true } })
  process.stdout.write(`Product 시드 완료 — 입력 ${PRODUCT_SEED.length}건, 활성 총 ${count}행\n`)
  await reportScenarioCoverage(prisma)
}

/**
 * 시나리오 커버 4조건 리포트 — E2E 계정 취향과 엮여야 성립하므로 (분담표 §5-S②) 여기서는
 * DB의 온보딩된 취향 전체를 상대로 근사 확인한다. 경고가 나오면 S의 표 또는 quickstart 의
 * E2E 계정 취향 세팅을 조정한다. 시드를 실패시키지는 않는다 — 판정은 T069 몫이다.
 */
async function reportScenarioCoverage(prisma: PrismaClient): Promise<void> {
  const kinds = ['WANT', 'HAVE', 'UNWANTED'] as const
  for (const kind of kinds) {
    const items = await prisma.tasteItem.findMany({
      where: { kind },
      select: { categoryId: true },
      distinct: ['categoryId'],
    })
    const categoryIds = items.map((i) => i.categoryId)
    const matched =
      categoryIds.length === 0
        ? 0
        : await prisma.product.count({ where: { isActive: true, categoryId: { in: categoryIds } } })
    const label = { WANT: 'want 일치', HAVE: 'have 카테고리', UNWANTED: 'unwanted 카테고리' }[kind]
    const mark = matched > 0 || categoryIds.length === 0 ? 'ok' : '⚠ 0건'
    process.stdout.write(
      `  커버 ${label}: 취향 카테고리 ${categoryIds.length}종 ↔ 활성 상품 ${matched}건 [${mark}]\n`,
    )
  }

  // ④ 싼 대안 여러 건 — 가장 비싼 활성 상품 기준으로 그보다 싼 상품 수를 본다 (근사)
  const priciest = await prisma.product.findFirst({
    where: { isActive: true },
    orderBy: { price: 'desc' },
    select: { name: true, price: true },
  })
  if (priciest) {
    const cheaper = await prisma.product.count({
      where: { isActive: true, price: { lt: priciest.price } },
    })
    const mark = cheaper >= 2 ? 'ok' : '⚠ 부족'
    process.stdout.write(
      `  커버 싼 대안: 최고가 "${priciest.name}"(${priciest.price}원)보다 싼 활성 상품 ${cheaper}건 [${mark}]\n`,
    )
  }
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL 이 비어 있다. .env.local 을 확인할 것 (tasks.md T006).')
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })

  try {
    for (const [index, name] of CATEGORY_NAMES.entries()) {
      const sortOrder = index + 1
      await prisma.category.upsert({
        where: { name },
        update: { sortOrder },
        create: { name, sortOrder },
      })
    }
    const count = await prisma.category.count()
    process.stdout.write(`Category 시드 완료 — 입력 ${CATEGORY_NAMES.length}건, 테이블 총 ${count}행\n`)

    await seedProducts(prisma)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`시드 실패: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
