// 일회성 점검 스크립트 — npx tsx scripts/db-check.mts
import nextEnv from '@next/env'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

nextEnv.loadEnvConfig(process.cwd())
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
})

const [items, profiles, users, categories] = await Promise.all([
  prisma.tasteItem.count(),
  prisma.tasteProfile.count(),
  prisma.user.count(),
  prisma.category.count(),
])
process.stdout.write(
  `TasteItem: ${items} · TasteProfile: ${profiles} · User: ${users} · Category: ${categories}\n`,
)
await prisma.$disconnect()
