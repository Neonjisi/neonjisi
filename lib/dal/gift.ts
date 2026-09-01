import { cache } from 'react'
import { z } from 'zod'
import type { GiftResolution, GiftStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { verifySession } from '@/lib/dal/session'
import { evaluateExpiry, evaluateExpiryAll } from '@/lib/gift/state'

/**
 * 선물 요청 DAL (T021) — 계약: specs/003-gift-request-payment/contracts/server-actions.md §3
 *
 * 읽기 함수는 내부에서 인가를 통과한 결과만 내보낸다 — 호출부(화면)에 검사가 없다 (M2 규칙).
 * **모든 함수가 `evaluateExpiry()` 를 경유한 결과만 반환한다** (R3). 예외를 만들지 않는다 —
 * 빠뜨린 조회 함수 하나가 "만료됐는데 승인이 된다" 가 된다 (분담표 §10, 리뷰 체크 항목).
 *
 * View 는 스냅샷 필드만 담는다 (R5) — 상품 가격·이름이 바뀌어도, 관계가 해제돼도 거래 화면은
 * 자기 데이터만으로 완결된다. Product·User 관계 객체는 View 타입에 아예 없다.
 * 예외 하나: 상대가 giver 인 쪽의 표시명 — giver 표시명은 스냅샷 컬럼이 없으므로 (data-model
 * GiftRequest 에는 receiverDisplayName 만 있다) User 행의 현재 표시명을 DAL 안에서 읽어
 * `counterpartDisplayName` 으로만 내보낸다. User 행은 관계 해제와 무관하게 존재하므로 성립한다.
 */

export type ProductSnapshot = { name: string; imageUrl: string | null; price: number }

export type ShippingAddress = {
  recipientName: string
  phone: string
  address: string
  addressDetail: string | null
}

export type ReceivedGiftView = {
  id: string
  counterpartDisplayName: string // 주는 사람의 표시명
  productSnapshot: ProductSnapshot
  requestedAmount: number
  respondDueAt: Date
  serverNow: Date // 카운트다운 보정용 (R8)
}

export type GiftListItem = {
  id: string
  role: 'giver' | 'receiver'
  status: GiftStatus
  resolution: GiftResolution | null // 대안 대조 라벨 (FR-042)
  isOngoing: boolean // 진행 중/지난 구분 — 화면 명세 §7 정의
  productSnapshot: ProductSnapshot
  counterProductSnapshot: ProductSnapshot | null
  requestedAmount: number
  finalAmount: number | null
  counterpartDisplayName: string
  respondDueAt: Date
  serverNow: Date
  createdAt: Date
}

export type GiftDetailView = {
  id: string
  role: 'giver' | 'receiver'
  status: GiftStatus
  resolution: GiftResolution | null
  productSnapshot: ProductSnapshot
  counterProductSnapshot: ProductSnapshot | null
  requestedAmount: number
  finalAmount: number | null
  counterpartDisplayName: string
  respondDueAt: Date
  serverNow: Date
  paymentMethodLabel: string | null // '신한 **** 4821' — giver 에게만
  attemptCount: number
  retryUntil: Date | null
  shippingAddress: ShippingAddress | null
}

/** 화면 명세 §7 "진행 중" 정의 — GiftRequest.status ∈ { pending, paying, payment_failed } */
const ONGOING_STATUSES: readonly GiftStatus[] = ['PENDING', 'PAYING', 'PAYMENT_FAILED']

// Json 컬럼은 타입이 보장되지 않는다 — 우리가 쓴 값이지만 읽는 경계에서 형태를 검사한다
// (M2 notification 패턴). 깨진 행은 목록에서 빼고 로그에 남긴다.
const productSnapshotSchema = z.object({
  name: z.string(),
  imageUrl: z.string().nullable(),
  price: z.number(),
})

const shippingAddressSchema = z.object({
  recipientName: z.string(),
  phone: z.string(),
  address: z.string(),
  addressDetail: z.string().nullable(),
})

function parseProductSnapshot(value: unknown, giftId: string): ProductSnapshot | null {
  const parsed = productSnapshotSchema.safeParse(value)
  if (!parsed.success) {
    console.error('[dal/gift] productSnapshot 형태가 계약과 다르다 — 행 제외', giftId)
    return null
  }
  return parsed.data
}

/** counter·배송지는 없으면(null) 그대로 null — 깨졌으면 그 값만 잃고 행은 살린다 */
function parseOptionalSnapshot<T>(
  schema: z.ZodType<T>,
  value: unknown,
  giftId: string,
  label: string,
): T | null {
  if (value === null || value === undefined) return null
  const parsed = schema.safeParse(value)
  if (!parsed.success) {
    console.error(`[dal/gift] ${label} 형태가 계약과 다르다 — 값 제외`, giftId)
    return null
  }
  return parsed.data
}

/** 목록·상세가 공유하는 select — evaluateExpiry 가 요구하는 필드(GiftForExpiry)를 포함한다 */
const giftSelect = {
  id: true,
  giverId: true,
  receiverId: true,
  status: true,
  resolution: true,
  respondDueAt: true,
  requestedAmount: true,
  finalAmount: true,
  productSnapshot: true,
  counterProductSnapshot: true,
  receiverDisplayName: true,
  paymentAttemptCount: true,
  paymentRetryUntil: true,
  shippingAddressSnapshot: true,
  createdAt: true,
  giver: { select: { displayName: true } },
  paymentMethod: { select: { cardBrand: true, cardLast4: true } },
} as const

type GiftRow = {
  id: string
  giverId: string
  receiverId: string
  status: GiftStatus
  resolution: GiftResolution | null
  respondDueAt: Date
  requestedAmount: number
  finalAmount: number | null
  productSnapshot: unknown
  counterProductSnapshot: unknown
  receiverDisplayName: string
  paymentAttemptCount: number
  paymentRetryUntil: Date | null
  shippingAddressSnapshot: unknown
  createdAt: Date
  giver: { displayName: string }
  paymentMethod: { cardBrand: string; cardLast4: string }
}

function toListItem(row: GiftRow, role: 'giver' | 'receiver', now: Date): GiftListItem | null {
  const productSnapshot = parseProductSnapshot(row.productSnapshot, row.id)
  if (!productSnapshot) return null
  return {
    id: row.id,
    role,
    status: row.status,
    resolution: row.resolution,
    isOngoing: ONGOING_STATUSES.includes(row.status),
    productSnapshot,
    counterProductSnapshot: parseOptionalSnapshot(
      productSnapshotSchema,
      row.counterProductSnapshot,
      row.id,
      'counterProductSnapshot',
    ),
    requestedAmount: row.requestedAmount,
    finalAmount: row.finalAmount,
    counterpartDisplayName: role === 'giver' ? row.receiverDisplayName : row.giver.displayName,
    respondDueAt: row.respondDueAt,
    serverNow: now,
    createdAt: row.createdAt,
  }
}

/**
 * 홈 승인 대기 — 내가 받은 PENDING, respondDueAt 임박순 (FR-038).
 * 조회가 곧 만료 판정 트리거다 (R3) — 평가에서 만료로 확정된 행은 여기서 빠진다.
 */
export const getPendingRequestsForMe = cache(async (): Promise<ReceivedGiftView[]> => {
  const { userId } = await verifySession()
  const now = new Date()

  const rows = (await prisma.giftRequest.findMany({
    where: { receiverId: userId, status: 'PENDING' },
    orderBy: { respondDueAt: 'asc' },
    select: giftSelect,
  })) as GiftRow[]

  const evaluated = await evaluateExpiryAll(rows, now)

  const views: ReceivedGiftView[] = []
  for (const row of evaluated) {
    if (row.status !== 'PENDING') continue
    const productSnapshot = parseProductSnapshot(row.productSnapshot, row.id)
    if (!productSnapshot) continue
    views.push({
      id: row.id,
      counterpartDisplayName: row.giver.displayName,
      productSnapshot,
      requestedAmount: row.requestedAmount,
      respondDueAt: row.respondDueAt,
      serverNow: now,
    })
  }
  return views
})

async function listGifts(role: 'giver' | 'receiver'): Promise<GiftListItem[]> {
  const { userId } = await verifySession()
  const now = new Date()

  const rows = (await prisma.giftRequest.findMany({
    where: role === 'giver' ? { giverId: userId } : { receiverId: userId },
    orderBy: { createdAt: 'desc' },
    select: giftSelect,
  })) as GiftRow[]

  const evaluated = await evaluateExpiryAll(rows, now)
  return evaluated
    .map((row) => toListItem(row, role, now))
    .filter((item): item is GiftListItem => item !== null)
}

/** 보낸 내역 (FR-042) — 만료·취소도 남는다. 진행 중/지난 구분은 isOngoing 으로 화면이 한다 */
export const getSentGifts = cache(async (): Promise<GiftListItem[]> => listGifts('giver'))

/** 받은 내역 (FR-042) */
export const getReceivedGifts = cache(async (): Promise<GiftListItem[]> => listGifts('receiver'))

/**
 * 단건 상세 — giver 또는 receiver 만 (canViewGiftRequest, data-model 조회 규칙).
 * 제3자·부재는 같은 null 로 뭉갠다 — 존재 여부를 알리면 id 탐색에 힌트가 된다 (M2 패턴).
 */
export const getGiftRequest = cache(async (giftRequestId: string): Promise<GiftDetailView | null> => {
  const { userId } = await verifySession()
  const now = new Date()

  const found = (await prisma.giftRequest.findUnique({
    where: { id: giftRequestId },
    select: giftSelect,
  })) as GiftRow | null

  if (!found) return null
  if (found.giverId !== userId && found.receiverId !== userId) return null

  const row = await evaluateExpiry(found, now)
  const role: 'giver' | 'receiver' = row.giverId === userId ? 'giver' : 'receiver'

  const productSnapshot = parseProductSnapshot(row.productSnapshot, row.id)
  if (!productSnapshot) return null

  return {
    id: row.id,
    role,
    status: row.status,
    resolution: row.resolution,
    productSnapshot,
    counterProductSnapshot: parseOptionalSnapshot(
      productSnapshotSchema,
      row.counterProductSnapshot,
      row.id,
      'counterProductSnapshot',
    ),
    requestedAmount: row.requestedAmount,
    finalAmount: row.finalAmount,
    counterpartDisplayName: role === 'giver' ? row.receiverDisplayName : row.giver.displayName,
    respondDueAt: row.respondDueAt,
    serverNow: now,
    // 결제수단은 giver 의 것 — receiver 에게는 존재 자체를 보이지 않는다
    paymentMethodLabel:
      role === 'giver' ? `${row.paymentMethod.cardBrand} **** ${row.paymentMethod.cardLast4}` : null,
    attemptCount: row.paymentAttemptCount,
    retryUntil: row.paymentRetryUntil,
    shippingAddress: parseOptionalSnapshot(
      shippingAddressSchema,
      row.shippingAddressSnapshot,
      row.id,
      'shippingAddressSnapshot',
    ),
  }
})
