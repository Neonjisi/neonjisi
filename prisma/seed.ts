/**
 * T012 — Category 시드. `npx prisma db seed` 로 실행한다 (prisma.config.ts 참조).
 *
 * name 을 키로 upsert 하므로 몇 번을 돌려도 결과가 같다 (멱등).
 * 순서 변경은 sortOrder 만 갱신하면 되고, 목록에서 빠진 항목은 지우지 않는다 —
 * 이미 취향이 참조 중인 카테고리는 FK Restrict 로 삭제가 막혀 있다.
 *
 * ⚠️ 아래 목록은 S 확정 전 초안이다 (team-assignment.md 6장 ①).
 *    기준: 선물 맥락에서 구체적일 것 — 사용자가 "이미 갖고 있는 것"을 3초 안에
 *    찾을 수 있어야 한다. S가 목록을 확정하면 이 배열만 교체한다.
 */
import { loadEnvConfig } from '@next/env'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

// prisma CLI 를 거치지 않고 직접 실행해도 .env.local 을 읽도록 한다.
loadEnvConfig(process.cwd())

const CATEGORY_NAMES: string[] = [
  // 음료·머그
  '텀블러',
  '머그컵',
  '커피용품',
  '원두·커피',
  '티·차',
  // 향·뷰티
  '향수',
  '핸드크림',
  '립밤',
  '바디케어',
  '헤어케어',
  // 홈·무드
  '캔들',
  '디퓨저',
  '꽃',
  '화분·식물',
  '담요',
  '쿠션',
  '조명·무드등',
  // 패션 소품
  '지갑',
  '카드지갑',
  '키링',
  '파우치',
  '에코백',
  '양말',
  '머플러',
  '장갑',
  '모자',
  '슬리퍼',
  '액세서리',
  // 테크
  '무선이어폰',
  '블루투스 스피커',
  '보조배터리',
  '휴대폰 케이스',
  '스마트워치 밴드',
  // 문구·취미
  '다이어리',
  '노트·필기구',
  '독서용품',
  '보드게임',
  // 푸드
  '초콜릿·디저트',
  '와인·주류',
  '영양제',
]

const SORT_ORDER_STEP = 10 // 사이에 끼워 넣을 여지를 둔다

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL 이 비어 있다. .env.local 을 확인할 것 (tasks.md T006).')
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })

  try {
    for (const [index, name] of CATEGORY_NAMES.entries()) {
      const sortOrder = (index + 1) * SORT_ORDER_STEP
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
