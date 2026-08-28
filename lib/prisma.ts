import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

// ⚠️ 이 모듈은 lib/dal/* 에서만 임포트한다. 화면·Server Action 에서 직접 쓰지 않는다.
//    M1 에는 RLS 2차 방어선이 없어 DAL 이 유일한 접근 제어 지점이다 (research R4, T023).

// 개발 중 hot reload 가 모듈을 다시 평가할 때마다 커넥션 풀이 새로 생기지 않도록
// 전역에 1개만 유지한다 (T015).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL 이 비어 있다. .env.local 을 확인할 것 (tasks.md T006).')
  }

  // Prisma 7: datasource url 을 스키마에 쓸 수 없고, 드라이버 어댑터가 필수다.
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
