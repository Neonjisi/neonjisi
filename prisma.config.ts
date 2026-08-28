import { loadEnvConfig } from '@next/env'
import { defineConfig } from 'prisma/config'

// Prisma CLI 는 Next 와 달리 .env.local 을 자동으로 읽지 않는다 (Prisma 7).
// Next 의 로더를 그대로 써서 런타임과 같은 우선순위로 환경 변수를 채운다.
loadEnvConfig(process.cwd())

// DIRECT_URL 이 없는 환경(예: Vercel 빌드의 `prisma generate`)에서도 config 로드가
// 실패하면 안 된다 — generate 는 DB 에 접속하지 않는다. env() 헬퍼는 로드 시점에
// 변수를 강제하므로 쓰지 않고, 없으면 원인이 읽히는 플레이스홀더를 넣는다.
// migrate/seed 처럼 실제 접속이 필요한 명령은 이 호스트명으로 즉시 실패해 원인을 알린다.
const cliDatabaseUrl =
  process.env.DIRECT_URL ?? 'postgresql://DIRECT_URL-env-var-not-set:5432/postgres'

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
    url: cliDatabaseUrl,
  },
})
