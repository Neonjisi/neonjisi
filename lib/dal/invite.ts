import { cache } from 'react'
import { prisma } from '@/lib/prisma'
import { verifySession } from '@/lib/dal/session'
import { generateInviteToken } from '@/lib/invite/token'
import { getRepresentativeTags } from '@/lib/dal/friend'

/**
 * 초대 링크 DAL (T014·T020·T021·T041) — 계약: specs/002-friend-taste-sharing/contracts/server-actions.md §1
 *
 * 읽기 함수는 내부에서 세션을 검증하고 본인 링크만 반환한다 — 호출부(화면)에 소유자 검사가 없다.
 * `getPreview()` 만 예외로 세션 없이(공개) 동작한다 (FR-008).
 *
 * 팀원 몫 의존:
 *  - `@/lib/invite/token` `generateInviteToken()` — D의 T010. 토큰은 여기서 직접 만들지 않는다 (R2)
 *  - `@/lib/dal/friend` `getRepresentativeTags(userId)` — H의 T022. WANT 최근 3건의 카테고리명 (FR-012)
 */

export type InviteLinkView = {
  id: string
  token: string
  expiresAt: Date
  revokedAt: Date | null
  usedCount: number
  isValid: boolean // revokedAt === null && expiresAt > now
}

export type PreviewView = {
  inviterUserId: string
  displayName: string
  avatarUrl: string | null
  tags: string[] // 최대 3건
}

/** 링크 유효 기간 — 발급 + 7일 (FR-003) */
export const INVITE_LINK_TTL_DAYS = 7
const INVITE_LINK_TTL_MS = INVITE_LINK_TTL_DAYS * 24 * 60 * 60 * 1000

/** 유효성 판정에 필요한 최소 형태. Prisma 행이든 뷰든 구조만 맞으면 된다 */
export type InviteLinkValidity = { revokedAt: Date | null; expiresAt: Date }

/**
 * T014 — 링크 유효성 판정. 지연 평가이며 배치로 만료 처리하지 않는다 (data-model "유효성 판정").
 *
 *   isValid(link) := link.revokedAt IS NULL AND link.expiresAt > now
 *
 * FR-004(유효한 링크가 있으면 새로 발급하지 않는다)와 FR-007(만료·중지·부재를 구분 불가로)이
 * 같은 판정식을 쓴다. 판정식은 여기 한 곳에만 둔다 — DB where 절에 따로 적지 않는다.
 */
export function isValid(link: InviteLinkValidity, now: Date = new Date()): boolean {
  return link.revokedAt === null && link.expiresAt.getTime() > now.getTime()
}

type InviteLinkRow = InviteLinkValidity & { id: string; token: string; usedCount: number }

function toView(link: InviteLinkRow, now: Date): InviteLinkView {
  return {
    id: link.id,
    token: link.token,
    expiresAt: link.expiresAt,
    revokedAt: link.revokedAt,
    usedCount: link.usedCount,
    isValid: isValid(link, now),
  }
}

/** 본인 링크 전부, 최신 발급순. 판정은 SQL 이 아니라 isValid() 가 한다 — 판정식을 한 곳에 두기 위해 */
async function listOwnLinks(userId: string) {
  return prisma.friendInviteLink.findMany({
    where: { inviterId: userId },
    orderBy: { createdAt: 'desc' },
  })
}

/**
 * T020 — FR-004: 유효한 링크가 있으면 **그것을 반환**하고, 없을 때만 발급한다.
 * 발급 시 expiresAt = now + 7일 (FR-003). 토큰은 lib/invite/token 이 만든다 (R2).
 *
 * 동시 요청 둘이 각자 발급하는 경합은 막지 않는다 — 두 링크 모두 유효하고 다음 호출은
 * 최신 것을 돌려주므로 시연 규모에서 해가 없다. 막으려면 (inviterId, 활성) partial unique 가 필요하다.
 */
export const getOrCreateActiveInviteLink = cache(async (): Promise<InviteLinkView> => {
  const { userId } = await verifySession()
  const now = new Date()

  const active = (await listOwnLinks(userId)).find((link) => isValid(link, now))
  if (active) return toView(active, now)

  const created = await prisma.friendInviteLink.create({
    data: {
      inviterId: userId,
      token: generateInviteToken(),
      expiresAt: new Date(now.getTime() + INVITE_LINK_TTL_MS),
    },
  })
  return toView(created, now)
})

/**
 * T021 — 미리보기 (FR-007·FR-008·FR-011). **세션 없음(공개).**
 * 무효면 만료·중지·부재를 구분하지 않고 전부 `null` — 구분하면 토큰 탐색에 힌트가 된다.
 * 무효일 때는 사용자·태그 조회 자체를 하지 않는다.
 * 취향 항목·서술은 어떤 경우에도 내보내지 않는다 (FR-009) — 반환 객체를 명시적으로 조립한다.
 */
export const getPreview = cache(async (token: string): Promise<PreviewView | null> => {
  const link = await prisma.friendInviteLink.findUnique({
    where: { token },
    select: { inviterId: true, revokedAt: true, expiresAt: true },
  })
  if (!link || !isValid(link)) return null

  const [inviter, tags] = await Promise.all([
    prisma.user.findUnique({
      where: { id: link.inviterId },
      select: { displayName: true, avatarUrl: true },
    }),
    getRepresentativeTags(link.inviterId),
  ])
  if (!inviter) return null

  return {
    inviterUserId: link.inviterId,
    displayName: inviter.displayName,
    avatarUrl: inviter.avatarUrl,
    tags,
  }
})

/**
 * T041 — 사용 중 + 지난 링크 (SCR-M2-03). 최신 발급순이며 각 항목의 `isValid` 로 나뉜다.
 * 유효한 링크는 get-or-create 규칙상 항상 가장 최근 것이므로, 화면은 `isValid` 로 두 묶음을 가른다.
 */
export const getMyInviteLinks = cache(async (): Promise<InviteLinkView[]> => {
  const { userId } = await verifySession()
  const now = new Date()
  return (await listOwnLinks(userId)).map((link) => toView(link, now))
})
