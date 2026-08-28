import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'

/**
 * 링크 성사 DAL (T023 · US1) — 계약: specs/002-friend-taste-sharing/contracts/server-actions.md §2
 *
 * `app/friends/actions/accept-invite.ts` 전용 프리미티브다. 화면·Server Action 은
 * `@/lib/prisma` 를 직접 쓰지 못하므로(eslint no-restricted-imports, research R4)
 * 성사에 필요한 조회·쓰기를 여기 둔다.
 *
 * `lib/dal/invite.ts`(링크 발급·미리보기·isValid) · `lib/dal/friend.ts`(친구 열람 관문)와
 * 파일을 나눈 이유: 같은 파일을 두 스토리가 만지지 않는다 (team-assignment.md §5).
 * 유효성 판정은 여기서 하지 않는다 — `isValid()` 한 곳(FR-004·FR-007 공용)을 호출부가 쓴다.
 */

export type InviteLinkRecord = {
  id: string
  inviterId: string
  expiresAt: Date
  revokedAt: Date | null
}

/**
 * 토큰으로 링크 한 건. 없으면 null.
 * 만료·중지 판정은 하지 않는다 — 호출부가 `isValid()` 로 부재와 같은 응답을 만든다 (FR-007).
 */
export async function findInviteLinkByToken(token: string): Promise<InviteLinkRecord | null> {
  return prisma.friendInviteLink.findUnique({
    where: { token },
    select: { id: true, inviterId: true, expiresAt: true, revokedAt: true },
  })
}

/**
 * 두 사용자 사이에 활성 관계가 있는지 — 방향 무관 (FR-015).
 * 한 행이 양방향을 담으므로 (a,b)·(b,a) 둘 다 본다. REMOVED 는 관계가 아니다 (FR-026).
 *
 * 이 검사를 통과해도 동시 요청은 C3(friendship_pair_active)가 막는다 — 검사는 좋은
 * 메시지를 위해, 제약은 정확성을 위해 둘 다 둔다 (contracts §2).
 */
export async function hasActiveFriendship(userA: string, userB: string): Promise<boolean> {
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

/** 알림 payload 에 스냅샷으로 복사해 넣을 표시명 (data-model.md Notification). 사용자가 없으면 null */
export async function findUserDisplayName(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { displayName: true },
  })
  return user?.displayName ?? null
}

export type AcceptInviteInput = {
  linkId: string
  /** 링크 발급자 = Friendship.requesterId (data-model.md) */
  inviterId: string
  /** 링크를 연 사람 = Friendship.addresseeId */
  addresseeId: string
  /** 알림에 스냅샷으로 남길 표시명 — 조회 시점에 User 를 다시 읽지 않는다 */
  addresseeDisplayName: string
}

/**
 * 성사 트랜잭션 (research R5) — 관계 생성 · usedCount 증가 · 발급자 알림을 **하나의
 * 트랜잭션**으로 묶는다. 셋 중 하나라도 실패하면 전부 롤백된다.
 *
 *  - 관계가 생겼는데 카운트가 안 오르면 발급자가 보는 숫자가 거짓이 된다 (FR-006)
 *  - 알림이 빠지면 승인 절차를 없앤 대가로 남긴 통제 수단이 사라진다 (FR-017)
 *  - 관계 생성이 C3 유니크 위반(P2002)으로 실패하면 카운트도 오르지 않고 알림도 남지
 *    않는다 — 이미 친구인 사람이 링크를 다시 열어도 사용 인원수가 늘지 않는다
 *
 * usedCount 는 `{ increment: 1 }` 원자 연산이다 — 읽고-더하고-쓰면 동시 사용에서
 * lost update 가 난다 (SC-008).
 *
 * P2002 는 그대로 던진다 — 호출부(액션)가 ALREADY_FRIENDS 로 바꾼다.
 * 관계 id 를 미리 만드는 이유: 배열형 $transaction 안에서는 앞 쿼리의 결과를 뒤 쿼리가
 * 참조할 수 없는데, 알림 payload 에 friendshipId 가 들어가야 한다.
 */
export async function acceptInviteTransaction(
  input: AcceptInviteInput,
): Promise<{ friendshipId: string }> {
  const friendshipId = randomUUID()

  await prisma.$transaction([
    prisma.friendship.create({
      data: {
        id: friendshipId,
        requesterId: input.inviterId,
        addresseeId: input.addresseeId,
        status: 'ACTIVE',
        inviteLinkId: input.linkId,
        acceptedAt: new Date(),
      },
      select: { id: true },
    }),
    prisma.friendInviteLink.update({
      where: { id: input.linkId },
      data: { usedCount: { increment: 1 } },
      select: { id: true },
    }),
    prisma.notification.create({
      data: {
        userId: input.inviterId,
        type: 'FRIEND_JOINED_VIA_LINK',
        payload: {
          friendshipId,
          friendUserId: input.addresseeId,
          friendDisplayName: input.addresseeDisplayName,
        },
      },
      select: { id: true },
    }),
  ])

  return { friendshipId }
}
