import { prisma } from '@/lib/prisma'

/**
 * 초대 링크 쓰기 프리미티브 (T042 · US3) — 계약: specs/002-friend-taste-sharing/contracts/server-actions.md §2
 *
 * `app/friends/actions/invite-link.ts` 전용이다. 읽기(발급·미리보기·목록·`isValid`)는
 * `lib/dal/invite.ts` 가 맡는다 — 그 파일은 US1·US3 가 함께 기대는 자리라 소유자가 따로 있다
 * (team-assignment §5). 상태 전이만 여기 두면 두 스토리가 같은 파일에서 만나지 않는다.
 * `lib/dal/friendship.ts`(해제)와 `lib/dal/friend.ts`(열람)를 가른 것과 같은 이유다.
 */

/** 중지 결과 — 호출부(Action)가 오류 코드로 옮긴다 */
export type RevokeOutcome = 'REVOKED' | 'ALREADY_REVOKED' | 'NOT_OWNER'

/**
 * 링크를 즉시 중지한다 (FR-005). 중지된 링크는 그 시점부터 무효다 —
 * 판정은 `isValid()` 한 곳이 하므로 여기서는 `revokedAt` 만 남긴다.
 *
 *  - **행을 지우지 않는다.** 지난 링크 목록(SCR-M2-03)과 `Friendship.inviteLinkId` 추적이
 *    거기 기댄다 — 어느 링크로 누가 왔는지가 남아야 한다
 *  - `revokedAt: null` 을 where 에 넣어 **이미 중지된 링크의 시각을 덮어쓰지 않는다**
 *  - 조회와 갱신을 한 문장으로 묶어 "확인 뒤 갱신" 사이의 경합을 없앤다 (removeActiveFriendship 과 같은 패턴)
 *  - 만료된 링크도 중지할 수 있다. 무효 사유가 겹칠 뿐이고, 발급자에게는 "끊었다"가 사실로 남는다
 *
 * 0건이 바뀌었을 때만 이유를 가른다. 남의 링크와 없는 링크는 **같은 응답**이다 —
 * 존재 여부를 알리면 링크 id 탐색에 힌트가 된다.
 */
export async function revokeOwnInviteLink(
  userId: string,
  linkId: string,
): Promise<RevokeOutcome> {
  const { count } = await prisma.friendInviteLink.updateMany({
    where: { id: linkId, inviterId: userId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
  if (count > 0) return 'REVOKED'

  const existing = await prisma.friendInviteLink.findUnique({
    where: { id: linkId },
    select: { inviterId: true },
  })
  return existing?.inviterId === userId ? 'ALREADY_REVOKED' : 'NOT_OWNER'
}
