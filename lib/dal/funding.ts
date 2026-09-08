import { cache } from 'react'
import { z } from 'zod'
import type { ContributionStatus, FundingStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireActiveFriendship } from '@/lib/dal/friend'
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
    // ★ 지분 마스킹은 여기서 끝난다 (R6). **참여자당 한 줄**이다 — 같은 사람의 여러 참여
    //   건(FR-011)은 foldByContributor() 가 합쳐서 내려보낸다.
    displayName: string
    amount: number | null // organizer·receiver: 전부 / contributor: 자기 것만 / friend: 전부 null
  }>
  myContribution: { amount: number; status: ContributionStatus } | null
  topup: { attemptCount: number; retryUntil: Date | null; amount: number | null } | null // organizer 에게만
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

/**
 * 뷰어의 활성 친구 id — 방향 무관. `hasActiveFriendship` 의 목록판이다: 단건 판정은 상세
 * (canViewFunding)가, 이 목록은 카드 목록의 friend 축이 쓴다. 규모(수십 명)에 충분하다.
 */
async function activeFriendIds(userId: string): Promise<string[]> {
  const rows = await prisma.friendship.findMany({
    where: { status: 'ACTIVE', OR: [{ requesterId: userId }, { addresseeId: userId }] },
    select: { requesterId: true, addresseeId: true },
  })
  return rows.map((row) => (row.requesterId === userId ? row.addresseeId : row.requesterId))
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

/** PAID > RESERVED > REFUNDED 우선순위로 표 밖 우선순위를 고른다 — 이유는 함수 위 주석 참고 */
const CONTRIBUTION_STATUS_PRIORITY: readonly ContributionStatus[] = ['PAID', 'RESERVED', 'REFUNDED']

/**
 * 여러 참여 건(FR-011 — 추가 참여 허용, unique 없음)을 화면 요약 한 줄로 접는다. 계약 타입
 * (`myContribution`)이 단일 값이라 대표 상태를 골라야 한다 — **PAID(확정) 를 최우선**으로 둔다.
 *
 * 이전 버전은 RESERVED 를 최우선으로 뒀었다("처리 중"을 먼저 알린다는 취지) — 하지만 이미
 * 확정된 결제(PAID)가 있는데 그 뒤 별도로 새 참여를 RESERVED 로 걸었다면, RESERVED 우선은
 * "이미 낸 돈"을 감추고 "아직 결제 안 된 예약액"을 대표값으로 내보내는 것이었다(리뷰 지적:
 * PAID 30,000 + RESERVED 10,000 인데 10,000 만 보이는 사례). contracts §6 이 화면 보정을
 * 금지하므로(R6) DAL 이 최종 답이어야 한다 — 확정액을 먼저 보여주는 쪽이 안전하다.
 *
 * 진행 중인 예약 자체는 `contributions[]` 의 본인 행으로 이미 보인다 — 대표값에서 굳이
 * RESERVED 를 앞세울 필요가 없다.
 *
 * 남은 한계(의도적으로 손대지 않음, 리뷰 원장에 유예): 미달/취소 정산으로 PAID→REFUNDED
 * 가 처리된 순간에도 별도의 미만료 RESERVED 행이 `reservedUntil` 까지 남아 있으면, 대표값은
 * REFUNDED 보다 그 RESERVED 를 먼저 고른다. 이 창은 짧고(TTL 만큼) `contributions[]` 로도
 * 확인 가능해 이번 수정 범위 밖으로 남긴다.
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

/**
 * 같은 참여자의 여러 참여 건(FR-011)을 **한 줄로 접는다**.
 *
 * 접지 않으면 화면이 "참여자 N명" 을 행 수로 세게 되고, 1명이 3번 참여하면 3명이 된다 —
 * 통합테스트 피드백("같은 사용자인데도 금액에 추가가 안되고 참여자가 늘어남")의 정체가
 * 이것이다. DB 가 건별로 행을 만드는 것 자체는 설계대로다(FR-011 · unique 없음) — 빠져
 * 있던 것은 **보여줄 때 접는 일**이라, contracts §6(화면 보정 금지) 대로 DAL 에서 끝낸다.
 *
 * 금액은 **활성 참여분(RESERVED+PAID) 합**이다 — `capTotal`(R3)과 같은 정의라 organizer
 * 뷰의 금액 합이 `remaining` 의 근거와 어긋나지 않는다. 환불분은 더하지 않는다(돌아간 돈이다).
 * 다만 활성분이 하나도 없으면(미달·취소 정산으로 전액 REFUNDED) 환불분 합을 대신 보여준다 —
 * 아니면 끝난 펀딩의 참여자 목록이 통째로 비어 "누가 참여했었는지" 가 사라진다.
 *
 * 순서는 **첫 참여 순**이다 — 입력이 createdAt asc 로 정렬돼 있고(fundingDetailSelect),
 * Map 이 삽입 순서를 지킨다.
 */
function foldByContributor(
  contributions: ReadonlyArray<ContributionRow & { displayName: string }>,
): Array<ContributionRow & { displayName: string }> {
  type Folded = { displayName: string; active: number; refunded: number; statuses: Set<ContributionStatus> }
  const byContributor = new Map<string, Folded>()

  for (const c of contributions) {
    const entry: Folded = byContributor.get(c.contributorId) ?? {
      displayName: c.displayName,
      active: 0,
      refunded: 0,
      statuses: new Set<ContributionStatus>(),
    }
    if (c.status === 'REFUNDED') entry.refunded += c.amount
    else entry.active += c.amount
    entry.statuses.add(c.status)
    byContributor.set(c.contributorId, entry)
  }

  return [...byContributor].map(([contributorId, entry]) => {
    const hasActive = entry.statuses.has('PAID') || entry.statuses.has('RESERVED')
    return {
      contributorId,
      displayName: entry.displayName,
      amount: hasActive ? entry.active : entry.refunded,
      // 대표 상태는 myContribution 과 같은 우선순위를 쓴다 — 같은 데이터에 두 규칙을 두지 않는다
      status: CONTRIBUTION_STATUS_PRIORITY.find((status) => entry.statuses.has(status)) ?? 'REFUNDED',
    }
  })
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
      reservedUntil: true,
      paidAt: true,
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
  contributions: Array<ContributionRow & {
    reservedUntil: Date
    paidAt: Date | null
    contributor: { displayName: string }
  }>
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

  const contributionsWithName = foldByContributor(
    found.contributions.map((c) => ({
      contributorId: c.contributorId,
      amount: c.amount,
      status: c.status,
      displayName: c.contributor.displayName,
    })),
  )
  // 정산 차액은 예약 없이 만든 주최자 명의 PAID 행이라 reservedUntil=paidAt 흔적을 갖는다.
  // 일반 참여는 reservedUntil이 결제 시각보다 뒤이므로 이 조건과 겹치지 않는다.
  const topupContribution = found.contributions.find(
    (c) =>
      c.contributorId === found.organizerId &&
      c.status === 'PAID' &&
      c.paidAt !== null &&
      c.reservedUntil.getTime() === c.paidAt.getTime(),
  )

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
        ? {
            attemptCount: found.topupAttemptCount,
            retryUntil: found.topupRetryUntil,
            amount: topupContribution?.amount ?? null,
          }
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
  // 카드에 그리지는 않지만 R1 판정이 읽는다 — 빼면 재시도 기한이 지난 SUCCEEDED 가
  // 목록 경로에서 영영 트리거되지 않는다 (lib/funding/state.ts shouldSettle 두 번째 갈래)
  topupRetryUntil: true,
} as const

type FundingCardRow = {
  id: string
  status: FundingStatus
  deadline: Date
  productSnapshot: unknown
  receiverDisplayName: string
  goalAmount: number
  minAmount: number
  topupRetryUntil: Date | null
}

/**
 * getMyFundings·getHomeFundings 공용 — 행 하나에 정산 트리거(R1)·예약 만료 해제(R2)를 지나게 한다.
 * 판정에 필요한 열을 빠짐없이 넘기려고 행을 통째로 받는다 (`fundingCardSelect` 와 한 짝).
 */
async function settleAndTotals(
  row: Pick<FundingCardRow, 'id' | 'status' | 'deadline' | 'topupRetryUntil'>,
  now: Date,
): Promise<{ status: FundingStatus; paid: number; cap: number }> {
  let currentStatus = row.status
  if (shouldSettle(row, now)) {
    await settleFunding(row.id)
    const fresh = await prisma.funding.findUnique({ where: { id: row.id }, select: { status: true } })
    if (fresh) currentStatus = fresh.status
  }
  await evaluateReservationExpiry(row.id, now)
  const [paid, cap] = await Promise.all([paidTotal(prisma, row.id), capTotal(prisma, row.id)])
  return { status: currentStatus, paid, cap }
}

/** 목록 규모(수십 건)에 충분한 순차 평가 — M3 evaluateExpiryAll 과 같은 자리 */
async function toCardViews(rows: readonly FundingCardRow[], now: Date): Promise<FundingCardView[]> {
  const views: FundingCardView[] = []
  for (const row of rows) {
    const { status, paid, cap } = await settleAndTotals(row, now)
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
 * 홈 진행 중 펀딩 (contracts §3, FR-023) — 내가 주최·수령·참여 중이거나 **수령자가 내 활성
 * 친구인** OPEN 만, 마감 임박순.
 *
 * 네 번째 축(친구)은 통합테스트 피드백으로 뒤늦게 들어왔다: FR-024 가 수령자의 활성 친구에게
 * 상세 열람을 허용하는데 목록에는 그 축이 없어, 권한은 있어도 URL 을 직접 받지 않으면 도달할
 * 방법이 없었다("당사자들에게는 노출되는데 다른 친구들에게는 노출이 안 됨"). 목록의 축을
 * `resolveViewerRole` 의 넷과 같게 맞춘다 — 접근 규칙을 두 벌로 만들지 않는다.
 *
 * 비친구는 여전히 제외다 — FR-024 가 "링크 소지가 접근 권한을 만들지 않는다"로 정한 선이다.
 *
 * DB 의 status='OPEN' 은 정산 트리거 이전 스냅샷이다 — settle 로 상태가 바뀐 행은 트리거
 * 통과 뒤 다시 걸러낸다(R1 이 "OPEN 이 아니게 됐다"를 화면에 그대로 반영해야 한다).
 */
export const getHomeFundings = cache(async (): Promise<FundingCardView[]> => {
  const { userId } = await verifySession()
  const now = new Date()

  const [contributedIds, friendIds] = await Promise.all([
    myContributedFundingIds(userId),
    activeFriendIds(userId),
  ])

  const rows = (await prisma.funding.findMany({
    where: {
      status: 'OPEN',
      OR: [
        { organizerId: userId },
        { receiverId: userId },
        { id: { in: contributedIds } },
        { receiverId: { in: friendIds } },
      ],
    },
    orderBy: { deadline: 'asc' },
    select: fundingCardSelect,
  })) as FundingCardRow[]

  const views = await toCardViews(rows, now)
  return views.filter((v) => v.status === 'OPEN')
})

/**
 * 친구 프로필의 진행 중 펀딩 — 그 친구가 **수령자**인 OPEN 만, 마감 임박순.
 *
 * 홈(getHomeFundings)은 "내 관련" 을 모으는 자리라 친구들 것이 섞이면 묻힌다. 그 친구를
 * 보러 온 화면에도 같은 목록이 있어야 "친구가 연 펀딩" 에 실제로 도달한다.
 *
 * 접근은 `requireActiveFriendship`(lib/dal/friend.ts) 한 곳에 맡긴다 — 친구 프로필의 다른
 * 섹션(취향·일정)과 같은 관문이라, 이 목록만 다른 규칙으로 새지 않는다. 비친구면 notFound.
 */
export const getFriendFundings = cache(async (friendUserId: string): Promise<FundingCardView[]> => {
  await requireActiveFriendship(friendUserId)
  const now = new Date()

  const rows = (await prisma.funding.findMany({
    where: { status: 'OPEN', receiverId: friendUserId },
    orderBy: { deadline: 'asc' },
    select: fundingCardSelect,
  })) as FundingCardRow[]

  const views = await toCardViews(rows, now)
  return views.filter((v) => v.status === 'OPEN')
})
