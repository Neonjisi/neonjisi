import { cache } from 'react'
import { prisma } from '@/lib/prisma'
import { verifySession } from '@/lib/dal/session'

/**
 * 결제수단 DAL (T030) — 계약: specs/003-gift-request-payment/contracts/server-actions.md §3
 *
 * 읽기 함수는 내부에서 세션을 검증하고 **본인 결제수단만** 반환한다 — 호출부(화면)에 소유자
 * 검사가 없다 (M1 research R4 · M2 와 같은 규칙).
 *
 * 🔒 **빌링키는 View 에 없다.** 타입에 아예 넣지 않아 화면·로그로 새어나갈 경로를 없앤다.
 * 복호화된 빌링키가 필요한 곳은 결제 실행(T017) 하나뿐이고, 그때 호출 직전에만 읽는다.
 *
 * 쓰기 프리미티브(등록·soft 삭제)도 여기 둔다 — M2 lib/dal/friendship.ts 와 같은 자리다.
 * Action 은 prisma 를 직접 만지지 않는다.
 */

/** 목록에 나오는 상태는 둘뿐이다 — DELETED 는 조회에서 빠진다 (soft 삭제) */
export type PaymentMethodViewStatus = 'ACTIVE' | 'EXPIRED'

export type PaymentMethodView = {
  id: string
  cardBrand: string
  cardLast4: string
  status: PaymentMethodViewStatus
  createdAt: Date
}

/** 결제가 아직 걸려 있는 상태들 — 수단 삭제 경고(FR-011)의 기준 */
const ACTIVE_GIFT_STATUSES = ['PENDING', 'PAYING', 'PAYMENT_FAILED'] as const

const VIEW_SELECT = {
  id: true,
  cardBrand: true,
  cardLast4: true,
  status: true,
  createdAt: true,
} as const

/**
 * 관리 화면(SCR-M3-07)의 목록. 삭제된 수단은 빼고, 활성 → 만료 순으로 낸다.
 * 삭제된 행 자체는 남는다 — 과거 요청의 표시(`cardLast4`)가 살아 있어야 한다.
 */
export const getMyPaymentMethods = cache(async (): Promise<PaymentMethodView[]> => {
  const { userId } = await verifySession()

  const rows = await prisma.paymentMethod.findMany({
    where: { userId, status: { not: 'DELETED' } },
    select: VIEW_SELECT,
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], // ACTIVE < EXPIRED (enum 선언 순서)
  })

  return rows.filter((row): row is PaymentMethodView => row.status !== 'DELETED')
})

/**
 * 요청 진입 차단 판정(FR-013 ②)이 쓰는 단건 조회. 빌링키는 사용자당 재사용하므로
 * 보통 한 건이고, 여럿이면 가장 최근 것을 쓴다 (SCR-M3-08 은 이 한 건을 표시한다).
 */
export const getActivePaymentMethod = cache(async (): Promise<PaymentMethodView | null> => {
  const { userId } = await verifySession()

  const row = await prisma.paymentMethod.findFirst({
    where: { userId, status: 'ACTIVE' },
    select: VIEW_SELECT,
    orderBy: { createdAt: 'desc' },
  })

  return row === null || row.status === 'DELETED' ? null : (row as PaymentMethodView)
})

/**
 * 삭제 경고 "진행 중 N건" (FR-011). 남의 수단 id 를 넣어도 0 이 나온다 —
 * 본인 giver 요청만 센다.
 */
export async function countActiveRequestsUsing(paymentMethodId: string): Promise<number> {
  const { userId } = await verifySession()

  return prisma.giftRequest.count({
    where: {
      paymentMethodId,
      giverId: userId,
      status: { in: [...ACTIVE_GIFT_STATUSES] },
    },
  })
}

/**
 * 등록 (T031 경유). 빌링키는 **이미 암호화된 값**을 받는다 — 이 함수는 평문을 모른다.
 * 암호화 지점을 Action 한 곳으로 고정해 두면, DAL 을 부르는 다른 경로가 생겨도
 * 평문이 DB 로 갈 길이 없다.
 */
export async function createPaymentMethod(input: {
  userId: string
  encryptedBillingKey: string
  cardBrand: string
  cardLast4: string
}): Promise<{ paymentMethodId: string }> {
  const created = await prisma.paymentMethod.create({
    data: {
      userId: input.userId,
      billingKey: input.encryptedBillingKey,
      cardBrand: input.cardBrand,
      cardLast4: input.cardLast4,
    },
    select: { id: true },
  })
  return { paymentMethodId: created.id }
}

/**
 * soft 삭제 — 행을 지우지 않는다 (M2 friendship 해제와 같은 철학).
 * 조회와 갱신을 한 문장(updateMany + 소유자·상태 조건)으로 묶어 "확인 뒤 갱신" 사이의
 * 경합을 없앤다. 이미 삭제됐으면 0건이 바뀌고, 그것이 곧 "지울 것이 없다"이다.
 *
 * 진행 중 요청이 이 수단을 참조해도 막지 않는다 — 경고 후 허용이고(FR-011), 그 뒤의
 * 결제 시도는 실패 경로로 흐른다 (Edge Case).
 */
export async function softDeletePaymentMethod(
  userId: string,
  paymentMethodId: string,
): Promise<{ deleted: boolean }> {
  const { count } = await prisma.paymentMethod.updateMany({
    where: { id: paymentMethodId, userId, status: { not: 'DELETED' } },
    data: { status: 'DELETED', deletedAt: new Date() },
  })
  return { deleted: count > 0 }
}

/** 본인 소유인지만 본다 — 삭제·재시도 수단 변경의 소유자 검사(NOT_OWNER) */
export async function isMyPaymentMethod(
  userId: string,
  paymentMethodId: string,
): Promise<boolean> {
  const found = await prisma.paymentMethod.findFirst({
    where: { id: paymentMethodId, userId },
    select: { id: true },
  })
  return found !== null
}

/**
 * 재시도 수단 변경(T053)의 검증 — 본인 소유이면서 **ACTIVE** 인지 (contracts §4).
 * 만료·삭제된 수단으로 바꿔 재시도하면 그 시도는 실패가 예정돼 있다 — 시도 횟수만 축난다.
 */
export async function isMyActivePaymentMethod(
  userId: string,
  paymentMethodId: string,
): Promise<boolean> {
  const found = await prisma.paymentMethod.findFirst({
    where: { id: paymentMethodId, userId, status: 'ACTIVE' },
    select: { id: true },
  })
  return found !== null
}
