import { cache } from 'react'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { verifySession } from '@/lib/dal/session'
import { getPaymentMaxAttempts } from '@/lib/config/gift'
import {
  resultVariantOf,
  retryAvailabilityOf,
  type ResultVariant,
  type RetryAvailability,
} from '@/lib/gift/outcome'
import { evaluateRetryExpiry } from '@/lib/gift/retry-window'

/**
 * 결과·복구 화면의 읽기 (T054·T055) — 계약: contracts §3 `GiftDetailView` 의 부분집합
 *
 * ⚠️ **임시 자리다.** 선물 조회 DAL(`lib/dal/gift.ts`)은 J 의 T021 소유다. D 가 US5 화면 둘을
 *    선행하느라 **그 두 화면이 쓰는 필드만** 여기 따로 뒀다 — 같은 파일을 동시에 쓰면 충돌한다.
 *    J 의 T021 이 오면 이 파일을 접고 `getGiftRequest()` 로 갈아끼운다.
 *
 * 두 가지를 지킨다:
 *  - **스냅샷만 렌더한다** (R5) — View 타입에 Product·User 조인 결과를 넣지 않는다. 관계가
 *    해제돼도, 상품이 내려가도 이 화면들은 그대로 열려야 한다
 *  - **인가는 여기서** — giver/receiver 아니면 null. 복구 화면은 giver 전용이다 (FR-030)
 *
 * ⚠️ 응답 마감의 지연 평가(R3)는 J 의 `evaluateExpiry()`(T015) 몫이다. 여기서는 표시만 만료로
 *    판정하고 상태를 바꾸지 않는다 — 그 함수가 붙으면 조회 진입점에서 확정된다.
 *    **재시도 기한**은 D 소유라 여기서 확정한다 (`evaluateRetryExpiry`) — 조회가 판정
 *    트리거라는 같은 규칙이다.
 */

const snapshotSchema = z.object({
  name: z.string(),
  imageUrl: z.string().nullable().optional(),
  price: z.number(),
})

type Snapshot = z.infer<typeof snapshotSchema>

/** 스냅샷이 깨졌으면 화면을 죽이는 대신 이름만 잃는다 (M2 알림 payload 와 같은 규약) */
function parseSnapshot(value: unknown, giftRequestId: string): Snapshot | null {
  const parsed = snapshotSchema.safeParse(value)
  if (!parsed.success) {
    console.error('[dal/gift-outcome] 스냅샷 형태가 계약과 다르다', giftRequestId)
    return null
  }
  return parsed.data
}

function methodLabel(method: { cardBrand: string; cardLast4: string } | null): string | null {
  return method === null ? null : `${method.cardBrand} **** ${method.cardLast4}`
}

const OUTCOME_SELECT = {
  id: true,
  giverId: true,
  receiverId: true,
  status: true,
  productId: true,
  productSnapshot: true,
  counterProductSnapshot: true,
  requestedAmount: true,
  counterAmount: true,
  finalAmount: true,
  receiverDisplayName: true,
  respondDueAt: true,
  paidAt: true,
  paymentAttemptCount: true,
  paymentRetryUntil: true,
  giver: { select: { displayName: true } },
  paymentMethod: { select: { cardBrand: true, cardLast4: true } },
} as const

export type GiftResultView = {
  giftRequestId: string
  role: 'giver' | 'receiver'
  variant: ResultVariant
  productName: string
  productImageUrl: string | null
  /** 실제로 청구된(또는 청구될) 금액 — 대안이면 대안 금액이다 */
  amount: number
  /** 대안으로 확정됐는지 — "차액은 청구되지 않았습니다" 고지의 조건 */
  isCountered: boolean
  requestedAmount: number
  counterpartDisplayName: string
  paidAt: Date | null
  /** giver 에게만 — 어떤 카드로 결제됐는지 */
  paymentMethodLabel: string | null
  /** "다시 보내기" 진입용 — 상품 상세(H 의 SCR-M3-04)로 간다 */
  productId: string
}

/**
 * 결과 화면(SCR-M3-15). 당사자가 아니면 **없는 것과 같은 응답**(null)을 준다 —
 * 존재 여부를 알리면 id 탐색에 힌트가 된다.
 */
export const getGiftResultView = cache(
  async (giftRequestId: string): Promise<GiftResultView | null> => {
    const { userId } = await verifySession()
    // 조회가 판정 트리거다 — 기한이 끝난 실패는 여기서 취소로 확정되고 양쪽에 고지된다 (FR-032)
    await evaluateRetryExpiry(giftRequestId)

    const row = await prisma.giftRequest.findUnique({
      where: { id: giftRequestId },
      select: OUTCOME_SELECT,
    })
    if (row === null) return null
    if (row.giverId !== userId && row.receiverId !== userId) return null

    const isGiver = row.giverId === userId
    const counterSnapshot = parseSnapshot(row.counterProductSnapshot, row.id)
    const snapshot = counterSnapshot ?? parseSnapshot(row.productSnapshot, row.id)

    return {
      giftRequestId: row.id,
      role: isGiver ? 'giver' : 'receiver',
      variant: resultVariantOf(row.status, row.respondDueAt, new Date()),
      productName: snapshot?.name ?? '선물',
      productImageUrl: snapshot?.imageUrl ?? null,
      amount: row.finalAmount ?? row.counterAmount ?? row.requestedAmount,
      isCountered: row.counterAmount !== null,
      requestedAmount: row.requestedAmount,
      // giver 표시명에는 스냅샷이 없다 (data-model) — 계약 §3 대로 이 자리에서만 읽는다
      counterpartDisplayName: isGiver ? row.receiverDisplayName : row.giver.displayName,
      paidAt: row.paidAt,
      paymentMethodLabel: isGiver ? methodLabel(row.paymentMethod) : null,
      productId: row.productId,
    }
  },
)

export type GiftRecoveryView = {
  giftRequestId: string
  productName: string
  productImageUrl: string | null
  amount: number
  receiverDisplayName: string
  attemptCount: number
  maxAttempts: number
  retryUntil: Date | null
  availability: RetryAvailability
  currentMethodLabel: string | null
  /** 지금 걸린 것 말고 쓸 수 있는 카드 — 수단 변경 후 재시도 (FR-030) */
  otherActiveMethods: { id: string; label: string }[]
}

/**
 * 복구 화면(SCR-M3-16). **giver 전용이다** — 수령자에게 실패 진행 상황을 노출하지 않는다
 * (FR-030). receiver 가 열면 null 이고, 화면은 결과 화면으로 보낸다.
 */
export const getGiftRecoveryView = cache(
  async (giftRequestId: string): Promise<GiftRecoveryView | null> => {
    const { userId } = await verifySession()
    await evaluateRetryExpiry(giftRequestId)

    const row = await prisma.giftRequest.findUnique({
      where: { id: giftRequestId },
      select: { ...OUTCOME_SELECT, paymentMethodId: true },
    })
    if (row === null || row.giverId !== userId) return null

    const counterSnapshot = parseSnapshot(row.counterProductSnapshot, row.id)
    const snapshot = counterSnapshot ?? parseSnapshot(row.productSnapshot, row.id)
    const maxAttempts = getPaymentMaxAttempts()

    const otherMethods = await prisma.paymentMethod.findMany({
      where: { userId, status: 'ACTIVE', id: { not: row.paymentMethodId } },
      select: { id: true, cardBrand: true, cardLast4: true },
      orderBy: { createdAt: 'desc' },
    })

    return {
      giftRequestId: row.id,
      productName: snapshot?.name ?? '선물',
      productImageUrl: snapshot?.imageUrl ?? null,
      amount: row.finalAmount ?? row.counterAmount ?? row.requestedAmount,
      receiverDisplayName: row.receiverDisplayName,
      attemptCount: row.paymentAttemptCount,
      maxAttempts,
      retryUntil: row.paymentRetryUntil,
      availability: retryAvailabilityOf(
        {
          status: row.status,
          attemptCount: row.paymentAttemptCount,
          maxAttempts,
          retryUntil: row.paymentRetryUntil,
        },
        new Date(),
      ),
      currentMethodLabel: methodLabel(row.paymentMethod),
      otherActiveMethods: otherMethods.map((method) => ({
        id: method.id,
        label: `${method.cardBrand} **** ${method.cardLast4}`,
      })),
    }
  },
)
