'use server'

import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { verifySession } from '@/lib/dal/session'
import { chargeGiftRequest } from '@/lib/gift/charge'
import { evaluateExpiry, transitionGiftRequest } from '@/lib/gift/state'
// D 소유 T018 — origin 에 오르기 전까지 이 import 는 미해결이다 (M3-J-BRIEFING ③④ 게이트:
// "없으면 import 만 써 두고 대기"). 상대경로가 아닌 별칭인 이유: 파일이 오르기 전까지
// 테스트가 vi.mock 으로 대체하는데, mock 은 별칭 지정자에만 걸린다 (T045 주석 참고).
import { guarded, type ActionResult } from '@/app/gifts/actions/shared'

/**
 * 수령자 응답 Server Action (T046 · US4)
 * 계약: specs/003-gift-request-payment/contracts/server-actions.md §4 `approveGift`·`counterGift`
 *
 * 검사 순서가 정해져 있다 — 바꾸면 오답이 난다:
 *   1. 세션 + receiver 본인      아니면 NOT_RECEIVER (부재·형식 불량도 같은 답 — 존재를 흘리지 않는다)
 *   2. 만료 지연 평가            evaluateExpiry (R3). EXPIRED → GIFT_EXPIRED · CANCELLED → GIFT_CANCELLED
 *   3. (counter만) 상한 검증     counterAmount > requestedAmount → COUNTER_OVER_LIMIT (C5 와 이중)
 *   4. 배송지 스냅샷 준비        빈 필드는 VALIDATION_FAILED — 빈 스냅샷이 결제로 넘어가면 안 된다
 *   5. PAYING 잠금               PENDING → PAYING 조건부 UPDATE (R2). 0행이면 재조회로 사유 구분
 *   6. (counter만) GIFT_COUNTERED — respond 가 보내는 유일한 알림 (R7). 잠금과 같은 트랜잭션
 *   7. chargeGiftRequest()       이후는 전부 charge(T017) 소유 — 상태·결제 알림에 손대지 않는다
 *
 * 이 파일에 거절 경로가 없다 — `DECLINED` 상태를 만들지 않는 것 자체가 요구사항의
 * 구현이다 (FR-020). 수령자의 선택지는 승인 / 대안 제시 / 무응답(→ 만료) 셋뿐이다.
 *
 * revalidatePath 를 부르지 않는다: 선물 화면은 전부 세션 의존 동적 라우트라 다음 요청에서
 * 새로 읽는다 (M2 accept-invite 와 같은 규약).
 */

export type RespondErrorCode =
  | 'NOT_RECEIVER'
  | 'GIFT_EXPIRED'
  | 'GIFT_CANCELLED'
  | 'ALREADY_RESPONDED'
  | 'COUNTER_OVER_LIMIT'
  | 'PRODUCT_UNAVAILABLE'
  | 'VALIDATION_FAILED'
  | 'STORAGE_FAILED'

/** contracts §2 — chargeGiftRequest() 의 반환 그대로 화면에 넘긴다 (SCR-M3-15·16 분기) */
export type GiftChargeResult =
  | { outcome: 'PAID' }
  | { outcome: 'PAYMENT_FAILED'; attemptCount: number; retryUntil: Date }
  | { outcome: 'CANCELLED' }

const NOT_RECEIVER_MESSAGE = '이 요청의 수령자만 응답할 수 있어요.'
const GIFT_EXPIRED_MESSAGE = '응답 기한이 지났어요.'
const GIFT_CANCELLED_MESSAGE = '요청이 취소되었어요.'
const ALREADY_RESPONDED_MESSAGE = '이미 응답이 처리된 요청이에요.'
const COUNTER_OVER_LIMIT_MESSAGE = '요청 금액 이하의 상품만 고를 수 있어요.'
const PRODUCT_UNAVAILABLE_MESSAGE = '지금은 고를 수 없는 상품이에요.'
const SHIPPING_INVALID_MESSAGE = '배송지 정보를 모두 입력해주세요.'
const RESPOND_FAILED_MESSAGE = '응답을 처리하지 못했어요. 잠시 후 다시 시도해주세요.'

// Server Action 은 클라이언트가 임의 페이로드로 호출할 수 있으므로 형식을 먼저 거른다.
const uuidSchema = z.string().uuid()

// SCR-M3-14 의 입력 4개. 이 주소는 이 선물에만 쓰인다 — 프로필에 저장하지 않는다 (FR-025).
const shippingAddressSchema = z.object({
  recipientName: z.string().trim().min(1).max(50),
  phone: z.string().trim().min(1).max(20),
  address: z.string().trim().min(1).max(200),
  addressDetail: z.string().trim().max(100).default(''),
})

export type ShippingAddressInput = z.input<typeof shippingAddressSchema>

function fail<T>(code: RespondErrorCode, message: string): ActionResult<T> {
  return { ok: false, error: { code, message } }
}

/** 2·5 공통 — PENDING 이 아닌 상태를 계약의 실패 코드로 옮긴다 */
function statusBlocked<T>(status: string): ActionResult<T> | null {
  if (status === 'PENDING') return null
  if (status === 'EXPIRED') return fail('GIFT_EXPIRED', GIFT_EXPIRED_MESSAGE)
  if (status === 'CANCELLED') return fail('GIFT_CANCELLED', GIFT_CANCELLED_MESSAGE)
  // PAYING · PAID · PAYMENT_FAILED — 이미 응답이 지나갔다
  return fail('ALREADY_RESPONDED', ALREADY_RESPONDED_MESSAGE)
}

/**
 * 잠금 0행 — 취소·만료·중복 어느 쪽이든 UPDATE 는 똑같이 0행이다.
 * 재조회로 사유를 구분해 돌려준다 (contracts §4-5).
 */
async function lockLost<T>(giftRequestId: string): Promise<ActionResult<T>> {
  const row = await prisma.giftRequest.findUnique({
    where: { id: giftRequestId },
    select: { status: true },
  })
  return statusBlocked<T>(row?.status ?? 'CANCELLED') ?? fail('ALREADY_RESPONDED', ALREADY_RESPONDED_MESSAGE)
}

/** 1·2 공통 게이트 — receiver 본인 확인 뒤 지연 만료 평가까지. 통과하면 PENDING 행이다 */
async function loadPendingForReceiver(giftRequestId: string, userId: string) {
  const parsed = uuidSchema.safeParse(giftRequestId)
  if (!parsed.success) {
    return { blocked: fail<never>('NOT_RECEIVER', NOT_RECEIVER_MESSAGE), gift: null }
  }

  const gift = await prisma.giftRequest.findUnique({ where: { id: parsed.data } })
  if (!gift || gift.receiverId !== userId) {
    return { blocked: fail<never>('NOT_RECEIVER', NOT_RECEIVER_MESSAGE), gift: null }
  }

  // 만료는 조회가 트리거다 — 확정 기록과 GIFT_EXPIRED 알림은 evaluateExpiry(R3) 소유
  const evaluated = await evaluateExpiry(gift, new Date())
  const blocked = statusBlocked<never>(evaluated.status)
  if (blocked) return { blocked, gift: null }

  return { blocked: null, gift }
}

export async function approveGift(input: {
  giftRequestId: string
  shippingAddress: ShippingAddressInput
}): Promise<ActionResult<GiftChargeResult>> {
  // 1. 세션 — 게이트는 guarded 바깥에 둔다 (redirect 예외를 그대로 Next 에 넘긴다)
  const { userId } = await verifySession()

  return guarded(RESPOND_FAILED_MESSAGE, async () => {
    const { blocked, gift } = await loadPendingForReceiver(input.giftRequestId, userId)
    if (blocked) return blocked

    // 4. 배송지 스냅샷 준비
    const shipping = shippingAddressSchema.safeParse(input.shippingAddress)
    if (!shipping.success) return fail('VALIDATION_FAILED', SHIPPING_INVALID_MESSAGE)

    // 5. PAYING 잠금 (R2) — 승인 확정 값이 잠금과 한 UPDATE 로 함께 기록된다
    const now = new Date()
    const { transitioned } = await transitionGiftRequest(gift.id, 'PENDING', 'PAYING', {
      data: {
        resolution: 'APPROVED',
        resolvedAt: now,
        finalAmount: gift.requestedAmount,
        shippingAddressSnapshot: shipping.data,
      },
    })
    if (!transitioned) return lockLost(gift.id)

    // 7. 이후는 전부 charge 소유 — 여기서 상태·결제 알림에 손대면 이중 발송이 난다
    return { ok: true, data: await chargeGiftRequest(gift.id) }
  })
}

export async function counterGift(input: {
  giftRequestId: string
  counterProductId: string
  shippingAddress: ShippingAddressInput
}): Promise<ActionResult<GiftChargeResult>> {
  const { userId } = await verifySession()

  return guarded(RESPOND_FAILED_MESSAGE, async () => {
    const { blocked, gift } = await loadPendingForReceiver(input.giftRequestId, userId)
    if (blocked) return blocked

    // 3. 상한 검증 — 화면 필터(getProductsUnderAmount)가 1차, 이 검사가 메시지, C5 가 정확성
    const idParsed = uuidSchema.safeParse(input.counterProductId)
    if (!idParsed.success) return fail('PRODUCT_UNAVAILABLE', PRODUCT_UNAVAILABLE_MESSAGE)

    const product = await prisma.product.findUnique({ where: { id: idParsed.data } })
    if (!product || !product.isActive) {
      return fail('PRODUCT_UNAVAILABLE', PRODUCT_UNAVAILABLE_MESSAGE)
    }
    if (product.price > gift.requestedAmount) {
      return fail('COUNTER_OVER_LIMIT', COUNTER_OVER_LIMIT_MESSAGE)
    }

    // 4. 배송지 스냅샷 준비
    const shipping = shippingAddressSchema.safeParse(input.shippingAddress)
    if (!shipping.success) return fail('VALIDATION_FAILED', SHIPPING_INVALID_MESSAGE)

    // 5+6. 잠금과 GIFT_COUNTERED 가 한 트랜잭션 — 잠금에 진 쪽은 알림 지점에 못 온다 (R7).
    //      대안 스냅샷도 잠금과 한 UPDATE 다 (C6: 3필드 전무/전유는 DB CHECK 가 최종 방어선).
    const now = new Date()
    const locked = await prisma.$transaction(async (tx) => {
      const { transitioned } = await transitionGiftRequest(gift.id, 'PENDING', 'PAYING', {
        db: tx,
        data: {
          resolution: 'COUNTERED',
          resolvedAt: now,
          counterProductId: product.id,
          counterProductSnapshot: {
            name: product.name,
            imageUrl: product.imageUrl,
            price: product.price,
          },
          counterAmount: product.price,
          counteredAt: now,
          finalAmount: product.price,
          shippingAddressSnapshot: shipping.data,
        },
      })
      if (!transitioned) return false

      // 대안 경로의 GIFT_COUNTERED 만 respond 가 보낸다 — 결제 알림은 charge 소유 (R7)
      await tx.notification.create({
        data: {
          userId: gift.giverId,
          type: 'GIFT_COUNTERED',
          payload: {
            giftRequestId: gift.id,
            counterpartDisplayName: gift.receiverDisplayName,
            productName: product.name,
            amount: product.price,
          },
        },
      })
      return true
    })
    if (!locked) return lockLost(gift.id)

    // 7. 이후는 전부 charge 소유
    return { ok: true, data: await chargeGiftRequest(gift.id) }
  })
}
