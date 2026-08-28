/**
 * T012 — Category 시드. `npx prisma db seed` 로 실행한다 (prisma.config.ts 참조).
 *
 * 목록의 원본(SSOT)은 specs/001-taste-profile/categories.md §4 — S(기획) 확정안 40개다.
 * name 을 키로 upsert 하므로 몇 번을 돌려도 결과가 같다 (멱등).
 * 순서 변경은 배열 순서만 바꾸면 되고, 목록에서 빠진 항목은 지우지 않는다 —
 * 이미 취향이 참조 중인 카테고리는 FK Restrict 로 삭제가 막혀 있다.
 *
 * ⚠️ name 은 unique 키다. 가운뎃점(·)·띄어쓰기까지 문서와 정확히 일치해야 한다 —
 *    오타 하나가 중복 행이 된다. 묶음은 순서에만 반영되고 DB에는 저장하지 않는다.
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
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`시드 실패: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
