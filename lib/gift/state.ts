import { z } from 'zod'
import type { GiftStatus, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

/**
 * 선물 요청 상태 전이 단일 모듈 (T015) — 계약: specs/003-gift-request-payment/research.md R6 · R3
 *
 * 허용 화살표는 아래 표가 전부다. 이 모듈 밖에서 `GiftRequest.status` 를 UPDATE 하지 않는다 —
 * 전이가 파일마다 흩어지면 "만료 후 승인" 같은 조합 버그가 파일 경계에서 샌다 (R6).
 * 만료는 cron 이 아니라 지연 평가다 — DAL 의 모든 조회와 응답 액션이 `evaluateExpiry()` 를
 * 경유한다. **경유하지 않는 조회 함수 금지** (R3, 리뷰 체크 항목).
 */

/** R6 표 — from → 허용되는 to. 여기 없는 전이(자기 자신 포함)는 전부 거부한다 */
const GIFT_TRANSITIONS = {
  PENDING: ['PAYING', 'EXPIRED', 'CANCELLED'], // 승인·대안 확정(R2 잠금) / 지연 만료(R3) / giver 취소
  PAYING: ['PAID', 'PAYMENT_FAILED'], // 결제 성공 / 실패 — 확정은 charge 소유 (R7)
  PAYMENT_FAILED: ['PAYING', 'CANCELLED'], // 재시도(R2 재잠금) / 횟수·기한 초과
  PAID: [], // 종착
  EXPIRED: [], // 종착
  CANCELLED: [], // 종착
} as const satisfies Record<GiftStatus, readonly GiftStatus[]>

/** 상태 6종 — `DECLINED` 는 존재하지 않는다. 값이 없는 것 자체가 FR-020 의 구현이다 */
export const GIFT_STATUSES = Object.keys(GIFT_TRANSITIONS) as readonly GiftStatus[]

export class InvalidGiftTransitionError extends Error {
  constructor(from: GiftStatus, to: GiftStatus) {
    super(`허용되지 않는 선물 상태 전이: ${from} → ${to} (research R6 표 밖)`)
    this.name = 'InvalidGiftTransitionError'
  }
}

export function canTransition(from: GiftStatus, to: GiftStatus): boolean {
  return (GIFT_TRANSITIONS[from] as readonly GiftStatus[]).includes(to)
}

export function assertTransition(from: GiftStatus, to: GiftStatus): void {
  if (!canTransition(from, to)) throw new InvalidGiftTransitionError(from, to)
}

/** 종착 상태로 갈 때 함수가 채우는 시각 컬럼 — 호출자가 빠뜨릴 수 없게 여기서 못박는다 */
const TERMINAL_TIMESTAMP: Partial<Record<GiftStatus, 'paidAt' | 'expiredAt' | 'cancelledAt'>> = {
  PAID: 'paidAt',
  EXPIRED: 'expiredAt',
  CANCELLED: 'cancelledAt',
}

type GiftWriteClient = Pick<Prisma.TransactionClient, 'giftRequest'>

/**
 * 전이의 유일한 쓰기 관문. 화살표 검증(R6) 뒤 **조건부 UPDATE** 로 기록한다 —
 * where 에 from 상태가 들어가므로 검사와 갱신 사이에 다른 요청이 끼어들 수 없다 (R2 와
 * 같은 원자성). `transitioned: false` 는 이미 다른 시도가 지나갔다는 뜻이다 — 호출자는
 * 이것을 실패가 아니라 "경합 패배" 로 다룬다 (승인 액션이면 ALREADY_RESPONDED).
 *
 * @param opts.data 전이에 얹을 추가 컬럼 (resolution · counter 3필드 · 스냅샷 등)
 * @param opts.db   호출자의 트랜잭션에 참여할 때 tx 를 넘긴다. 기본은 전역 prisma
 */
export async function transitionGiftRequest(
  giftRequestId: string,
  from: GiftStatus,
  to: GiftStatus,
  opts: {
    data?: Omit<Prisma.GiftRequestUncheckedUpdateManyInput, 'status'>
    db?: GiftWriteClient
    now?: Date
  } = {},
): Promise<{ transitioned: boolean }> {
  assertTransition(from, to)
  const db = opts.db ?? prisma
  const timestampField = TERMINAL_TIMESTAMP[to]

  const { count } = await db.giftRequest.updateMany({
    where: { id: giftRequestId, status: from },
    data: {
      status: to,
      ...(timestampField ? { [timestampField]: opts.now ?? new Date() } : {}),
      ...opts.data,
    },
  })
  return { transitioned: count > 0 }
}

// ── 지연 만료 평가 (R3) ──────────────────────────────────────────────────────

/** 만료 판정·알림 payload 에 필요한 최소 형태 — DAL 조회 행이 그대로 만족한다 */
export type GiftForExpiry = {
  id: string
  status: GiftStatus
  respondDueAt: Date
  giverId: string
  receiverDisplayName: string
  requestedAmount: number
  productSnapshot: unknown
}

/**
 * gift 계열 알림의 공통 payload — 조회 시점에 User·Product 를 읽지 않도록 표시용 값을
 * 복사한다 (data-model "NotificationType" 표). 발송 지점 전부(생성·대안·만료·charge)가
 * 이 형태를 쓴다 — 알림 목록(T056)이 형태 하나만 알면 되게.
 */
export type GiftNotificationPayload = {
  giftRequestId: string
  counterpartDisplayName: string
  productName: string
  amount: number
}

/** payload 는 Json 컬럼 — 우리가 쓴 값이지만 형태는 경계에서 검사한다 (M2 notification 패턴) */
const productSnapshotNameSchema = z.object({ name: z.string() })

function expiryPayload(gift: GiftForExpiry): GiftNotificationPayload {
  const parsed = productSnapshotNameSchema.safeParse(gift.productSnapshot)
  if (!parsed.success) {
    // 표시값이 깨졌다고 만료 기록까지 막지 않는다 — 그 줄의 표시만 잃는다
    console.error('[gift/state] productSnapshot 형태가 계약과 다르다 — 표시명 대체', gift.id)
  }
  return {
    giftRequestId: gift.id,
    counterpartDisplayName: gift.receiverDisplayName,
    productName: parsed.success ? parsed.data.name : '상품',
    amount: gift.requestedAmount,
  }
}

/** R3 판정 그대로 — `respondDueAt < now` 이고 PENDING 일 때만. 표시(카운트다운 0)와 달리
 *  판정은 언제나 서버 몫이다 (R8) */
export function shouldExpire(
  gift: Pick<GiftForExpiry, 'status' | 'respondDueAt'>,
  now: Date = new Date(),
): boolean {
  return gift.status === 'PENDING' && gift.respondDueAt.getTime() < now.getTime()
}

/**
 * 유일한 만료 판정 지점 (R3). 기한이 지난 PENDING 을 만나면 **그 자리에서** EXPIRED 로
 * 기록하고, 같은 트랜잭션에서 giver 에게 GIFT_EXPIRED 알림을 만든다 — cron 없이, 조회가
 * 트리거다 (도메인 모델 §8).
 *
 * 조건부 UPDATE 가 0행이면(동시에 다른 조회·응답이 먼저 지나감) 알림을 만들지 않고 —
 * 이중 발송 금지 — 현재 상태를 다시 읽어 돌려준다. 호출자는 반환값의 status 만 믿으면 된다.
 */
export async function evaluateExpiry<T extends GiftForExpiry>(
  gift: T,
  now: Date = new Date(),
): Promise<T> {
  if (!shouldExpire(gift, now)) return gift

  return prisma.$transaction(async (tx) => {
    const { transitioned } = await transitionGiftRequest(gift.id, 'PENDING', 'EXPIRED', {
      db: tx,
      now,
    })

    if (!transitioned) {
      const current = await tx.giftRequest.findUnique({
        where: { id: gift.id },
        select: {
          status: true,
          resolution: true,
          expiredAt: true,
          cancelledAt: true,
          paidAt: true,
        },
      })
      return current ? { ...gift, ...current } : gift
    }

    await tx.notification.create({
      data: { userId: gift.giverId, type: 'GIFT_EXPIRED', payload: expiryPayload(gift) },
    })
    return { ...gift, status: 'EXPIRED' as GiftStatus, expiredAt: now }
  })
}

/** 목록 조회용 — 각 행을 순서대로 평가한다. 홈·내역 목록 규모(수십 건)에 충분하다 */
export async function evaluateExpiryAll<T extends GiftForExpiry>(
  gifts: readonly T[],
  now: Date = new Date(),
): Promise<T[]> {
  const evaluated: T[] = []
  for (const gift of gifts) evaluated.push(await evaluateExpiry(gift, now))
  return evaluated
}
