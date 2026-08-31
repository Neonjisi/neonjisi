import type { GiftRequest, GiftStatus, Prisma, Product } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { transitionGiftRequest, type GiftNotificationPayload } from '@/lib/gift/state'

/**
 * 응답 액션 전용 쓰기 DAL (T046 · US4) — M2 lib/dal/accept-invite.ts 와 같은 자리다.
 * 화면·액션의 Prisma 직접 접근 금지(eslint no-restricted-imports · research R4)를 지키는
 * 경계로, app/gifts/actions/respond.ts 만 쓴다. 조회 View 는 lib/dal/gift.ts(T021) 소유 —
 * 여기 함수는 View 를 만들지 않고 원시 행만 다룬다 (인가 판정은 respond.ts 검사 순서 1이 한다).
 */

export function findGiftRequestById(giftRequestId: string): Promise<GiftRequest | null> {
  return prisma.giftRequest.findUnique({ where: { id: giftRequestId } })
}

export function findProductById(productId: string): Promise<Product | null> {
  return prisma.product.findUnique({ where: { id: productId } })
}

/** 잠금 0행의 사유 구분용 재조회 (contracts §4-5) — 상태만 읽는다 */
export async function findGiftRequestStatus(giftRequestId: string): Promise<GiftStatus | null> {
  const row = await prisma.giftRequest.findUnique({
    where: { id: giftRequestId },
    select: { status: true },
  })
  return row?.status ?? null
}

/**
 * counter 잠금 + GIFT_COUNTERED 알림 — 한 트랜잭션 (contracts §4-5·6).
 * 잠금(조건부 UPDATE, R2)에 진 쪽은 알림 지점에 도달하지 못하므로 이중 발송이 없다 (R7).
 * 결제 알림은 여기 없다 — 잠금 이후는 전부 chargeGiftRequest(T017) 소유다.
 */
export async function lockCounterAndNotify(input: {
  giftRequestId: string
  giverId: string
  data: Omit<Prisma.GiftRequestUpdateManyMutationInput, 'status'>
  payload: GiftNotificationPayload
}): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const { transitioned } = await transitionGiftRequest(input.giftRequestId, 'PENDING', 'PAYING', {
      db: tx,
      data: input.data,
    })
    if (!transitioned) return false

    await tx.notification.create({
      data: { userId: input.giverId, type: 'GIFT_COUNTERED', payload: input.payload },
    })
    return true
  })
}
