/**
 * 홈 만료·정렬 E2E가 응답 기한만 조절하는 제한된 DB 픽스처.
 * 상태·상품·결제·알림은 제품 UI와 Server Action이 만들고, 실제 시간을 기다릴 수 없는
 * `respondDueAt`만 바꾼다. funding-db.ts의 deadline 예외와 같은 원칙이다.
 */
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

let client: PrismaClient | null = null

function db(): PrismaClient {
  if (client) return client
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL이 비어 있다 — 홈 만료 E2E를 실행할 수 없다')
  client = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
  return client
}

export async function setGiftRespondDueAt(giftRequestId: string, dueAt: Date): Promise<void> {
  const { count } = await db().giftRequest.updateMany({
    where: { id: giftRequestId, status: 'PENDING' },
    data: { respondDueAt: dueAt },
  })
  if (count !== 1) throw new Error(`PENDING 선물의 응답 기한을 바꾸지 못했다: ${giftRequestId}`)
}

/** 공유 E2E 계정 사이에 이전 실행이 남긴 PENDING 요청을 만료 대상으로 만든다. */
export async function expirePendingGiftsBetween(giverId: string, receiverId: string): Promise<void> {
  await db().giftRequest.updateMany({
    where: { giverId, receiverId, status: 'PENDING' },
    data: { respondDueAt: new Date(Date.now() - 60_000) },
  })
}

/** 반복 실행 시 홈 상위 3건을 오염시키는 이 스펙 전용 일정만 정리한다. */
export async function deleteE2ETestEvents(userId: string): Promise<void> {
  await db().event.deleteMany({ where: { userId, title: { startsWith: 'E2E 기념일 ' } } })
}

export async function expireLatestActivePaymentMethod(userId: string): Promise<void> {
  const method = await db().paymentMethod.findFirst({
    where: { userId, status: 'ACTIVE' },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  })
  if (!method) throw new Error('만료 처리할 ACTIVE 결제수단이 없다')
  await db().paymentMethod.update({ where: { id: method.id }, data: { status: 'EXPIRED' } })
}

export async function closeGiftDb(): Promise<void> {
  if (!client) return
  const closing = client
  client = null
  await closing.$disconnect()
}
