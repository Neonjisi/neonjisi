import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  createGiftNotifications,
  type GiftNotificationEntry,
} from '@/lib/dal/notification'
import type { GiftStatusValue } from '@/lib/gift/state'

/**
 * 결제 기록 DAL (T017) — 계약: specs/003-gift-request-payment/contracts/server-actions.md §3
 *
 * `chargeGiftRequest()` 전용이다. 결제 결과의 **기록·상태 확정·알림을 한 트랜잭션**으로 묶는다
 * (research R7). 셋이 흩어지면 "결제는 됐는데 상태가 안 바뀌었다" 또는 "상태는 바뀌었는데
 * 알림이 없다"가 생기고, 화면상으로는 완전히 정상으로 보인다.
 *
 * 트랜잭션이 여기 있는 이유: prisma 는 lib/dal/ 에서만 임포트한다 (lib/prisma.ts 의 규약).
 * 도메인 판정(재시도 소진 여부·전이 허용)은 lib/gift/charge.ts 가 하고, 여기는 그 결정을
 * 원자적으로 쓰기만 한다.
 */

/** charge 가 결제를 시도하기 위해 필요한 것 전부 — 스냅샷과 결제수단 상태를 함께 낸다 */
export type ChargeTarget = {
  giftRequestId: string
  giverId: string
  receiverId: string
  status: GiftStatusValue
  /** 청구 금액 — finalAmount ?? counterAmount ?? requestedAmount */
  amount: number
  /** 결제사에 보낼 주문명 — 대안이 있으면 대안 상품명 (스냅샷에서 읽는다, R5) */
  orderName: string
  giverDisplayName: string
  receiverDisplayName: string
  /** 암호화된 채로 낸다 — 복호화는 결제사 호출 직전 한 곳에서만 (R10) */
  encryptedBillingKey: string
  paymentMethodStatus: 'ACTIVE' | 'EXPIRED' | 'DELETED'
  paymentAttemptCount: number
  paymentRetryUntil: Date | null
}

type SnapshotShape = { name?: unknown; price?: unknown }

function snapshotName(snapshot: unknown): string | null {
  if (typeof snapshot !== 'object' || snapshot === null) return null
  const name = (snapshot as SnapshotShape).name
  return typeof name === 'string' && name !== '' ? name : null
}

/**
 * 결제 대상 조회. View 가 아니라 **결제에 필요한 원본**이다 — 화면용 조회(lib/dal/gift.ts)와
 * 달리 빌링키와 결제수단 상태를 포함하므로, 부르는 곳은 charge 하나뿐이어야 한다.
 */
export async function getChargeTarget(giftRequestId: string): Promise<ChargeTarget | null> {
  const row = await prisma.giftRequest.findUnique({
    where: { id: giftRequestId },
    select: {
      id: true,
      giverId: true,
      receiverId: true,
      status: true,
      requestedAmount: true,
      counterAmount: true,
      finalAmount: true,
      productSnapshot: true,
      counterProductSnapshot: true,
      receiverDisplayName: true,
      paymentAttemptCount: true,
      paymentRetryUntil: true,
      giver: { select: { displayName: true } },
      paymentMethod: { select: { billingKey: true, status: true } },
    },
  })
  if (row === null) return null

  return {
    giftRequestId: row.id,
    giverId: row.giverId,
    receiverId: row.receiverId,
    status: row.status,
    amount: row.finalAmount ?? row.counterAmount ?? row.requestedAmount,
    orderName:
      snapshotName(row.counterProductSnapshot) ?? snapshotName(row.productSnapshot) ?? '선물',
    giverDisplayName: row.giver.displayName,
    receiverDisplayName: row.receiverDisplayName,
    encryptedBillingKey: row.paymentMethod.billingKey,
    paymentMethodStatus: row.paymentMethod.status,
    paymentAttemptCount: row.paymentAttemptCount,
    paymentRetryUntil: row.paymentRetryUntil,
  }
}

/**
 * 계약 §3 `recordPayment(tx, input)` — Payment 행 하나. C8(정확히 하나의 대상)은 DB 가 지킨다.
 * 실패한 시도도 남긴다 (FR-033) — 그때는 결제사 거래 번호가 없다.
 */
export async function recordPayment(
  tx: Prisma.TransactionClient,
  input: {
    giftRequestId: string
    amount: number
    status: 'PAID' | 'FAILED'
    providerTxId: string | null
    paidAt: Date | null
  },
): Promise<void> {
  await tx.payment.create({
    data: {
      giftRequestId: input.giftRequestId,
      amount: input.amount,
      status: input.status,
      providerTxId: input.providerTxId,
      paidAt: input.paidAt,
    },
  })
}

/**
 * 성공 확정 — Payment(PAID) + `PAYING → PAID` + 양쪽 알림 (FR-029).
 *
 * 상태 갱신은 `status: 'PAYING'` 조건부다 (R2). 0행이면 다른 흐름이 이미 상태를 옮겼다는
 * 뜻인데, **결제는 이미 일어났으므로 트랜잭션을 되돌리지 않는다** — 기록을 잃는 편이
 * 훨씬 나쁘다. 그 사실을 로그로 남기고 결과로 알린다.
 */
export async function finalizeChargeSuccess(input: {
  giftRequestId: string
  amount: number
  providerTxId: string
  paidAt: Date
  notifications: GiftNotificationEntry[]
}): Promise<{ statusApplied: boolean }> {
  return prisma.$transaction(async (tx) => {
    await recordPayment(tx, {
      giftRequestId: input.giftRequestId,
      amount: input.amount,
      status: 'PAID',
      providerTxId: input.providerTxId,
      paidAt: input.paidAt,
    })

    const { count } = await tx.giftRequest.updateMany({
      where: { id: input.giftRequestId, status: 'PAYING' },
      data: {
        status: 'PAID',
        paidAt: input.paidAt,
        finalAmount: input.amount,
        resolvedAt: new Date(),
      },
    })

    if (count === 0) {
      console.error(
        '[dal/payment] 결제는 성공했는데 PAYING 이 아니었다 — 상태는 그대로 두고 기록만 남긴다',
        input.giftRequestId,
      )
      return { statusApplied: false }
    }

    await createGiftNotifications(tx, input.notifications)
    return { statusApplied: true }
  })
}

/**
 * 실패 확정 — Payment(FAILED) + `PAYING → PAYMENT_FAILED | CANCELLED` + 알림.
 *
 * 취소로 갈지(횟수·기한 소진) 재시도를 남길지는 **호출자가 판정해서** 넘긴다 —
 * 설정값 해석은 도메인(charge)의 몫이고, 여기는 원자적으로 쓰기만 한다.
 */
export async function finalizeChargeFailure(input: {
  giftRequestId: string
  amount: number
  nextStatus: 'PAYMENT_FAILED' | 'CANCELLED'
  attemptCount: number
  retryUntil: Date
  failedAt: Date
  notifications: GiftNotificationEntry[]
}): Promise<{ statusApplied: boolean }> {
  return prisma.$transaction(async (tx) => {
    await recordPayment(tx, {
      giftRequestId: input.giftRequestId,
      amount: input.amount,
      status: 'FAILED',
      providerTxId: null,
      paidAt: null,
    })

    const { count } = await tx.giftRequest.updateMany({
      where: { id: input.giftRequestId, status: 'PAYING' },
      data: {
        status: input.nextStatus,
        paymentAttemptCount: input.attemptCount,
        paymentRetryUntil: input.retryUntil,
        cancelledAt: input.nextStatus === 'CANCELLED' ? input.failedAt : undefined,
      },
    })

    if (count === 0) {
      console.error(
        '[dal/payment] 결제 실패를 기록할 때 PAYING 이 아니었다 — 상태는 그대로 둔다',
        input.giftRequestId,
      )
      return { statusApplied: false }
    }

    await createGiftNotifications(tx, input.notifications)
    return { statusApplied: true }
  })
}

/** 재시도 가능 여부를 판정하는 데 필요한 것만 (T053) */
export type RetryTarget = {
  giverId: string
  status: GiftStatusValue
  paymentAttemptCount: number
  paymentRetryUntil: Date | null
  paymentMethodId: string
}

export async function getRetryTarget(giftRequestId: string): Promise<RetryTarget | null> {
  return prisma.giftRequest.findUnique({
    where: { id: giftRequestId },
    select: {
      giverId: true,
      status: true,
      paymentAttemptCount: true,
      paymentRetryUntil: true,
      paymentMethodId: true,
    },
  })
}

/**
 * 재잠금 `PAYMENT_FAILED → PAYING` (R2). 조건부 UPDATE 라서 더블탭·동시 요청 중
 * **한 번만** 통과한다 — 0행이면 이미 다른 시도가 진행 중이다.
 * 결제수단 변경도 이 한 문장 안에서 한다: 먼저 바꾸고 잠그면, 잠금에 실패한 요청의
 * 수단만 조용히 바뀌어 있다.
 */
export async function lockForRetry(
  giftRequestId: string,
  paymentMethodId?: string,
): Promise<{ locked: boolean }> {
  const { count } = await prisma.giftRequest.updateMany({
    where: { id: giftRequestId, status: 'PAYMENT_FAILED' },
    data: {
      status: 'PAYING',
      ...(paymentMethodId === undefined ? {} : { paymentMethodId }),
    },
  })
  return { locked: count > 0 }
}
