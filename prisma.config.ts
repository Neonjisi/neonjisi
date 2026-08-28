import { loadEnvConfig } from '@next/env'
import { defineConfig, env } from 'prisma/config'

// Prisma CLI 는 Next 와 달리 .env.local 을 자동으로 읽지 않는다 (Prisma 7).
// Next 의 로더를 그대로 써서 런타임과 같은 우선순위로 환경 변수를 채운다.
loadEnvConfig(process.cwd())

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'npx tsx prisma/seed.ts', // T012 — `npx prisma db seed` 로 실행
  },
  datasource: {
    // 이 config 는 Prisma CLI(migrate/seed)만 읽는다 — 런타임은 lib/prisma.ts 가
    // DATABASE_URL(Transaction pooler, 6543) 로 붙는다.
    // 마이그레이션은 prepared statement 가 필요해 Session pooler (5432) 로 붙는다.
    // Transaction pooler 로 migrate 를 돌리면 P1010 류 오류가 난다.
    // (Prisma 7 의 defineConfig datasource 에는 directUrl 이 없어 url 에 직접 지정)
    url: env('DIRECT_URL'),
  },
})
