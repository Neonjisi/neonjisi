import { cache } from 'react'
import { z } from 'zod'
import type { ContributionStatus, FundingStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { verifySession } from '@/lib/dal/session'
import { settleFunding } from '@/lib/funding/settle'
import { evaluateReservationExpiry, shouldSettle } from '@/lib/funding/state'
import { capTotal, paidTotal } from '@/lib/funding/totals'

/**
 * 펀딩 조회 DAL (T016) — 계약: specs/004-group-funding/contracts/server-actions.md §3 (R6)
 *
 * `getFunding`·`getMyFundings`·`getHomeFundings` **모든 함수가 정산 트리거(R1)와 예약 만료
 * 해제(R2)를 경유한 결과만 반환한다** — 빠뜨린 조회 함수 하나가 "마감 지났는데 OPEN" 을
 * 만든다(M4-J-BRIEFING 막히기 쉬운 지점 표). `settleFunding()`(D, T014)은 이 세션이 만들지
 * 않는다 — import 만 써 둔다. 실물이 오르기 전까지는 이 모듈을 쓰는 화면이 깨지는 게 정상이다
 * (M3 respond.ts 가 charge.ts 를 실물 없이 import 했던 것과 같은 자리).
 *
 * 지분 3단계 마스킹(R6)은 여기서 끝낸다 — 화면은 이미 걸러진 값만 받는다.
 * `Payment.fundingContributionId` 에는 Prisma `@relation` 이 없다(①이 raw SQL FK 만 걸었다,
 * research R4) — 이 DAL 은 Payment 조인이 필요 없어 영향이 없다.
 */

export type ProductSnapshot = { name: string; imageUrl: string | null; price: number }

export type FundingRole = 'organizer' | 'receiver' | 'contributor' | 'friend'

export type FundingDetailView = {
  id: string
  role: FundingRole
  status: FundingStatus
  productSnapshot: ProductSnapshot
  receiverDisplayName: string
  goalAmount: number
  minAmount: number
  deadline: Date
  serverNow: Date // 카운트다운·D-day 보정용 (M3 R8 과 같은 이유)
  paidTotal: number // 진행바 (R3)
  remaining: number // goal − capTotal (R3)
  reservedInFlight: number // "결제 중 N원" 줄 — capTotal − paidTotal
  contributions: Array<{
    // ★ 지분 마스킹은 여기서 끝난다 (R6)
    displayName: string
    amount: number | null // organizer·receiver: 전부 / contributor: 자기 것만 / friend: 전부 null
  }>
  myContribution: { amount: number; status: ContributionStatus } | null
  topup: { attemptCount: number; retryUntil: Date | null } | null // organizer 에게만
}

export type FundingCardView = {
  id: string
  status: FundingStatus
  productSnapshot: ProductSnapshot
  receiverDisplayName: string
  goalAmount: number
  minAmount: number
  deadline: Date
  serverNow: Date
  paidTotal: number
  remaining: number
}

// Json 컬럼은 타입이 보장되지 않는다 — 쓰는 값이지만 읽는 경계에서 형태를 검사한다 (M2·M3 패턴)
const productSnapshotSchema = z.object({
  name: z.string(),
  imageUrl: z.string().nullable(),
  price: z.number(),
})

function parseProductSnapshot(value: unknown, fundingId: string): ProductSnapshot | null {
  const parsed = productSnapshotSchema.safeParse(value)
  if (!parsed.success) {
    console.error('[dal/funding] productSnapshot 형태가 계약과 다르다 — 행 제외', fundingId)
    return null
  }
  return parsed.data
}

/**
 * 뷰어와 수령자 사이 활성 친구 관계 — 방향 무관 (R6 canViewFunding 의 activeFriendsOf 축).
 * `lib/dal/friend.ts`(H 소유, requireActiveFriendship)가 아직 없어 같은 판정식을 로컬로 둔다 —
 * M3 `lib/dal/gift-request.ts` 의 `hasActiveFriendship` 와 같은 이유·같은 모양이다.
 */
async function hasActiveFriendship(userA: string, userB: string): Promise<boolean> {
  const found = await prisma.friendship.findFirst({
    where: {
      status: 'ACTIVE',
      OR: [
        { requesterId: userA, addresseeId: userB },
        { requesterId: userB, addresseeId: userA },
      ],
    },
    select: { id: true },
  })
  return found !== null
}

/** R6 canViewFunding — 접근 가능하면 역할을, 아니면 null 을 돌려준다(역할 판정 = 접근 판정) */
async function resolveViewerRole(
  viewerId: string,
  funding: { organizerId: string; receiverId: string },
  contributorIds: readonly string[],
): Promise<FundingRole | null> {
  if (viewerId === funding.organizerId) return 'organizer'
  if (viewerId === funding.receiverId) return 'receiver'
  if (contributorIds.includes(viewerId)) return 'contributor'
  if (await hasActiveFriendship(viewerId, funding.receiverId)) return 'friend'
  return null
}

type ContributionRow = { contributorId: string; amount: number; status: ContributionStatus }

/** 지분 3단계 마스킹 (R6) — organizer·receiver: 전부 / contributor: 자기 것만 / friend: 전부 null */
function maskContributions(
  contributions: ReadonlyArray<ContributionRow & { displayName: string }>,
  viewerId: string,
  role: FundingRole,
): FundingDetailView['contributions'] {
  return contributions.map((c) => ({
    displayName: c.displayName,
    amount:
      role === 'organizer' || role === 'receiver'
        ? c.amount
        : role === 'contributor' && c.contributorId === viewerId
          ? c.amount
          : null,
  }))
}

/** RESERVED > PAID > REFUNDED 우선순위로 표 밖 우선순위를 고른다 — 이유는 함수 위 주석 참고 */
const CONTRIBUTION_STATUS_PRIORITY: readonly ContributionStatus[] = ['RESERVED', 'PAID', 'REFUNDED']

/**
 * 여러 참여 건(FR-011 — 추가 참여 허용, unique 없음)을 화면 요약 한 줄로 접는다. 계약 타입
 * (`myContribution`)이 단일 값이라, RESERVED(처리 중) > PAID(확정) > REFUNDED(환불 종료)
 * 우선순위로 대표 상태를 고르고 그 상태의 행만 합산한다. 실제로는 마감 전엔 RESERVED·PAID
 * 혼재만 가능하고, 정산 후엔 한 상태로 수렴한다(성사=PAID 유지, 미달/취소=REFUNDED 일괄) —
 * settleFunding() 이 PAID 건을 전부 함께 처리하므로 상태가 섞인 채 남지 않는다.
 */
function resolveMyContribution(
  contributions: ReadonlyArray<ContributionRow>,
  viewerId: string,
): FundingDetailView['myContribution'] {
  const mine = contributions.filter((c) => c.contributorId === viewerId)
  for (const status of CONTRIBUTION_STATUS_PRIORITY) {
    const matching = mine.filter((c) => c.status === status)
    if (matching.length > 0) {
      return { amount: matching.reduce((sum, c) => sum + c.amount, 0), status }
    }
  }
  return null
}

const fundingDetailSelect = {
  id: true,
  organizerId: true,
  receiverId: true,
  status: true,
  deadline: true,
  productSnapshot: true,
  receiverDisplayName: true,
  goalAmount: true,
  minAmount: true,
  topupAttemptCount: true,
  topupRetryUntil: true,
  contributions: {
    select: {
      contributorId: true,
      amount: true,
      status: true,
      contributor: { select: { displayName: true } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
} as const

type FundingDetailRow = {
  id: string
  organizerId: string
  receiverId: string
  status: FundingStatus
  deadline: Date
  productSnapshot: unknown
  receiverDisplayName: string
  goalAmount: number
  minAmount: number
  topupAttemptCount: number
  topupRetryUntil: Date | null
  contributions: Array<ContributionRow & { contributor: { displayName: string } }>
}

/**
 * 단건 상세 (contracts §3) — canViewFunding 통과분만. 제3자·부재는 같은 null 로 뭉갠다
 * (M2 패턴 — 존재 여부를 알리면 id 탐색에 힌트가 된다).
 *
 * 순서: ① 접근(역할) 판정 → ② 정산 트리거(R1, shouldSettle 이면 settleFunding 호출) →
 * ③ 예약 만료 해제(R2) → ④ (②·③이 DB 를 바꿨다면) 최신 상태로 재조회 → ⑤ 총액·뷰 조립.
 * settle·만료 해제가 상태·참여 목록을 바꿀 수 있어, 바뀐 경우에만 다시 읽는다.
 */
export const getFunding = cache(async (fundingId: string): Promise<FundingDetailView | null> => {
  const { userId } = await verifySession()
  const now = new Date()

  let found = (await prisma.funding.findUnique({
    where: { id: fundingId },
    select: fundingDetailSelect,
  })) as FundingDetailRow | null
  if (!found) return null

  const role = await resolveViewerRole(
    userId,
    found,
    found.contributions.map((c) => c.contributorId),
  )
  if (!role) return null

  const didSettle = shouldSettle(found, now)
  if (didSettle) await settleFunding(fundingId)

  const { releasedCount } = await evaluateReservationExpiry(fundingId, now)

  if (didSettle || releasedCount > 0) {
    const fresh = (await prisma.funding.findUnique({
      where: { id: fundingId },
      select: fundingDetailSelect,
    })) as FundingDetailRow | null
    if (!fresh) return null
    found = fresh
  }

  const productSnapshot = parseProductSnapshot(found.productSnapshot, found.id)
  if (!productSnapshot) return null

  const [paid, cap] = await Promise.all([paidTotal(prisma, fundingId), capTotal(prisma, fundingId)])

  const contributionsWithName = found.contributions.map((c) => ({
    contributorId: c.contributorId,
    amount: c.amount,
    status: c.status,
    displayName: c.contributor.displayName,
  }))

  return {
    id: found.id,
    role,
    status: found.status,
    productSnapshot,
    receiverDisplayName: found.receiverDisplayName,
    goalAmount: found.goalAmount,
    minAmount: found.minAmount,
    deadline: found.deadline,
    serverNow: now,
    paidTotal: paid,
    remaining: Math.max(found.goalAmount - cap, 0),
    reservedInFlight: cap - paid,
    contributions: maskContributions(contributionsWithName, userId, role),
    myContribution: resolveMyContribution(found.contributions, userId),
    topup:
      role === 'organizer'
        ? { attemptCount: found.topupAttemptCount, retryUntil: found.topupRetryUntil }
        : null,
  }
})

const fundingCardSelect = {
  id: true,
  status: true,
  deadline: true,
  productSnapshot: true,
  receiverDisplayName: true,
  goalAmount: true,
  minAmount: true,
} as const

type FundingCardRow = {
  id: string
  status: FundingStatus
  deadline: Date
  productSnapshot: unknown
  receiverDisplayName: string
  goalAmount: number
  minAmount: number
}

/** getMyFundings·getHomeFundings 공용 — 행 하나에 정산 트리거(R1)·예약 만료 해제(R2)를 지나게 한다 */
async function settleAndTotals(
  fundingId: string,
  status: FundingStatus,
  deadline: Date,
  now: Date,
): Promise<{ status: FundingStatus; paid: number; cap: number }> {
  let currentStatus = status
  if (shouldSettle({ status, deadline }, now)) {
    await settleFunding(fundingId)
    const fresh = await prisma.funding.findUnique({ where: { id: fundingId }, select: { status: true } })
    if (fresh) currentStatus = fresh.status
  }
  await evaluateReservationExpiry(fundingId, now)
  const [paid, cap] = await Promise.all([paidTotal(prisma, fundingId), capTotal(prisma, fundingId)])
  return { status: currentStatus, paid, cap }
}

/** 목록 규모(수십 건)에 충분한 순차 평가 — M3 evaluateExpiryAll 과 같은 자리 */
async function toCardViews(rows: readonly FundingCardRow[], now: Date): Promise<FundingCardView[]> {
  const views: FundingCardView[] = []
  for (const row of rows) {
    const { status, paid, cap } = await settleAndTotals(row.id, row.status, row.deadline, now)
    const productSnapshot = parseProductSnapshot(row.productSnapshot, row.id)
    if (!productSnapshot) continue
    views.push({
      id: row.id,
      status,
      productSnapshot,
      receiverDisplayName: row.receiverDisplayName,
      goalAmount: row.goalAmount,
      minAmount: row.minAmount,
      deadline: row.deadline,
      serverNow: now,
      paidTotal: paid,
      remaining: Math.max(row.goalAmount - cap, 0),
    })
  }
  return views
}

/** 내가 참여한(RESERVED·PAID·REFUNDED 무관) 펀딩 id — 중복 참여(FR-011)를 한 건으로 접는다 */
async function myContributedFundingIds(userId: string): Promise<string[]> {
  const rows = await prisma.fundingContribution.findMany({
    where: { contributorId: userId },
    select: { fundingId: true },
    distinct: ['fundingId'],
  })
  return rows.map((r) => r.fundingId)
}

/**
 * 내역 탭 2종 (contracts §3, FR-022) — 내가 연 것 / 참여한 것. 상태 전부(진행 중·끝난 것
 * 모두) 돌려준다 — 구분은 화면(status)이 한다. 수령자로만 관여한 펀딩은 계약 타입에 자리가
 * 없어 어느 탭에도 없다(getHomeFundings 가 그 역할을 겸한다).
 */
export const getMyFundings = cache(
  async (): Promise<{ organized: FundingCardView[]; contributed: FundingCardView[] }> => {
    const { userId } = await verifySession()
    const now = new Date()

    const organizedRows = (await prisma.funding.findMany({
      where: { organizerId: userId },
      orderBy: { deadline: 'asc' },
      select: fundingCardSelect,
    })) as FundingCardRow[]

    const contributedIds = await myContributedFundingIds(userId)
    const contributedRows = contributedIds.length
      ? ((await prisma.funding.findMany({
          where: { id: { in: contributedIds } },
          orderBy: { deadline: 'asc' },
          select: fundingCardSelect,
        })) as FundingCardRow[])
      : []

    const [organized, contributed] = await Promise.all([
      toCardViews(organizedRows, now),
      toCardViews(contributedRows, now),
    ])
    return { organized, contributed }
  },
)

/**
 * 홈 진행 중 펀딩 (contracts §3, FR-023) — 내가 주최·수령·참여 중인 **OPEN** 만, 마감 임박순.
 * DB 의 status='OPEN' 은 정산 트리거 이전 스냅샷이다 — settle 로 상태가 바뀐 행은 트리거
 * 통과 뒤 다시 걸러낸다(R1 이 "OPEN 이 아니게 됐다"를 화면에 그대로 반영해야 한다).
 */
export const getHomeFundings = cache(async (): Promise<FundingCardView[]> => {
  const { userId } = await verifySession()
  const now = new Date()

  const contributedIds = await myContributedFundingIds(userId)

  const rows = (await prisma.funding.findMany({
    where: {
      status: 'OPEN',
      OR: [{ organizerId: userId }, { receiverId: userId }, { id: { in: contributedIds } }],
    },
    orderBy: { deadline: 'asc' },
    select: fundingCardSelect,
  })) as FundingCardRow[]

  const views = await toCardViews(rows, now)
  return views.filter((v) => v.status === 'OPEN')
})
