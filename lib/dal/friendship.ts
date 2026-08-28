import { prisma } from '@/lib/prisma'

/**
 * 친구 관계 쓰기 프리미티브 (T051) — 계약: specs/002-friend-taste-sharing/contracts/server-actions.md §2
 *
 * Server Action 전용이다. userId 는 항상 세션에서 얻은 본인 것만 전달된다.
 * 읽기(목록·상세·`requireActiveFriendship`)는 `lib/dal/friend.ts` 가 맡는다 — 여기는 상태 전이만 둔다.
 */

/**
 * 활성 관계를 REMOVED 로 전이한다 (research R9 · FR-025~FR-027).
 *
 *  - **행을 지우지 않는다.** status · removedAt · removedBy 만 바뀐다 — 이력과 재추가 판정에 쓴다
 *  - 한 쌍이 한 행이므로 방향(requester/addressee)을 가리지 않고 찾는다 — 어느 쪽이 눌러도 같은 행이다
 *  - 조회와 갱신을 한 문장(updateMany + status 조건)으로 묶어 "확인 뒤 갱신" 사이의 경합을 없앤다.
 *    이미 REMOVED 면 0건이 바뀌고, 그것이 곧 "활성 관계 없음"이다
 *
 * @returns 바뀐 행이 있으면 true. false 면 활성 관계가 없다 (→ NOT_FRIENDS)
 */
export async function removeActiveFriendship(
  userId: string,
  friendUserId: string,
): Promise<{ removed: boolean }> {
  const { count } = await prisma.friendship.updateMany({
    where: {
      status: 'ACTIVE',
      OR: [
        { requesterId: userId, addresseeId: friendUserId },
        { requesterId: friendUserId, addresseeId: userId },
      ],
    },
    data: { status: 'REMOVED', removedAt: new Date(), removedBy: userId },
  })
  return { removed: count > 0 }
}
