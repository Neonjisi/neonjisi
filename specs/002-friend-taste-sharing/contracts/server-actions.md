# Contracts: Server Actions · DAL (마일스톤 2)

**Date**: 2026-08-28 | **Plan**: [plan.md](./plan.md) | **Data Model**: [data-model.md](./data-model.md)

M1의 [`001-taste-profile/contracts/server-actions.md`](../../001-taste-profile/contracts/server-actions.md)
규약을 그대로 잇는다. 예상 가능한 실패는 **예외가 아니라 결과 값**으로 돌려주고(FR-016 계열),
예상 못 한 예외는 `guarded`가 `STORAGE_FAILED`로 바꾼다.

```ts
type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; message: string } }
```

---

## 1. DAL — 읽기 (`lib/dal/`)

읽기 함수는 **내부에서 인가를 통과한 결과만** 내보낸다. 호출부(화면)에 소유자 검사가 없다.

### `lib/dal/session.ts` — 추가

| 함수 | 반환 | 설명 |
|---|---|---|
| `getOptionalSession()` | `Promise<Session \| null>` | **세션이 없으면 `null`을 반환하고 redirect 하지 않는다.** 미리보기 라우트 전용 (R3) |

> ⚠️ **`verifySession()`을 미리보기에 쓰면 안 된다.** 세션이 없을 때 `/login`으로 redirect 하므로
> 비가입자가 미리보기를 볼 수 없게 된다(FR-008 위반). 두 함수의 차이가 이것뿐이라 실수하기 쉽다.

### `lib/dal/friend.ts` — 신규

| 함수 | 반환 | 인가 | 설명 |
|---|---|---|---|
| `requireActiveFriendship(friendUserId)` | `Promise<{ friendshipId: string }>` | 본인 세션 | 활성 관계가 없으면 **접근 거부**(`notFound()`). 친구 데이터를 읽는 모든 경로의 관문 (FR-022) |
| `getFriends()` | `Promise<FriendListItem[]>` | 본인 세션 | 활성 친구 목록 + 각자 대표 태그. **N+1 없이 한 번에** 모아 온다 (R7, FR-018) |
| `getFriendTaste(friendUserId)` | `Promise<FriendTasteView>` | `requireActiveFriendship` | 친구의 취향 항목 전체 + 취향 서술 (FR-020) |

```ts
type FriendListItem = {
  userId: string
  displayName: string
  avatarUrl: string | null
  tags: string[]          // 최대 3건. 없으면 빈 배열 (FR-012)
}

type FriendTasteView = {
  userId: string
  displayName: string
  avatarUrl: string | null
  description: string | null
  itemsByKind: Record<TasteKind, TasteItemView[]>   // M1 의 타입 재사용
}
```

> **M1의 `lib/dal/taste.ts`를 고쳐 쓰지 않는다.** 그 함수들에 `userId` 파라미터를 뚫으면
> "본인 것만 반환한다"는 안전 성질이 깨져 호출부가 잘못 쓸 수 있다. 친구 전용 함수를 새로 만들고
> 그 안에서 `requireActiveFriendship()`을 부른다 (R8).

### `lib/dal/invite.ts` — 신규

| 함수 | 반환 | 인가 | 설명 |
|---|---|---|---|
| `getOrCreateActiveInviteLink()` | `Promise<InviteLinkView>` | 본인 세션 | 유효한 링크가 있으면 **그것을 반환**, 없으면 발급 (FR-004) |
| `getMyInviteLinks()` | `Promise<InviteLinkView[]>` | 본인 세션 | 사용 중 + 지난 링크 (SCR-M2-03) |
| `getPreview(token)` | `Promise<PreviewView \| null>` | **없음 (공개)** | 유효한 토큰이면 표시명·이미지·대표 태그. 무효면 `null` (FR-007·FR-011) |

```ts
type InviteLinkView = {
  id: string
  token: string
  expiresAt: Date
  revokedAt: Date | null
  usedCount: number
  isValid: boolean        // revokedAt === null && expiresAt > now
}

type PreviewView = {
  inviterUserId: string
  displayName: string
  avatarUrl: string | null
  tags: string[]          // 최대 3건
}
```

> **`getPreview()`가 `null`을 돌려주는 경우는 세 가지 — 만료 · 중지 · 부재 — 이고 구분하지
> 않는다.** 호출부도 세 경우를 한 문구로 표시한다. 구분해 알리면 토큰 탐색에 힌트를 준다(FR-007).

### `lib/dal/notification.ts` — 신규

| 함수 | 반환 | 인가 | 설명 |
|---|---|---|---|
| `getMyNotifications()` | `Promise<NotificationView[]>` | 본인 세션 | 최신순 (FR-029) |
| `getUnreadCount()` | `Promise<number>` | 본인 세션 | 배지용 |

```ts
type NotificationView = {
  id: string
  type: 'FRIEND_JOINED_VIA_LINK'
  payload: { friendshipId: string; friendUserId: string; friendDisplayName: string }
  readAt: Date | null
  createdAt: Date
}
```

---

## 2. Server Actions (`app/friends/actions.ts`)

> **이 파일은 한 사람이 소유한다.** M1에서 `app/taste/actions.ts`를 J가 혼자 쓰기로 해
> US3↔US4 충돌을 없앤 것과 같은 이유다 (team-assignment 4장).

| Action | 입력 | 성공 | 실패 코드 |
|---|---|---|---|
| `revokeInviteLink` | `{ linkId }` | `{ ok: true }` | `NOT_OWNER` · `ALREADY_REVOKED` · `STORAGE_FAILED` |
| `acceptInvite` | `{ token }` | `{ friendUserId }` | `LINK_INVALID` · `SELF_INVITE` · `ALREADY_FRIENDS` · `STORAGE_FAILED` |
| `removeFriend` | `{ friendUserId }` | `{ ok: true }` | `NOT_FRIENDS` · `STORAGE_FAILED` |
| `markNotificationRead` | `{ notificationId }` | `{ ok: true }` | `NOT_OWNER` · `STORAGE_FAILED` |
| `markAllNotificationsRead` | — | `{ count }` | `STORAGE_FAILED` |

### `acceptInvite` — 검사 순서

순서가 정해져 있다. 바꾸면 오답이 나온다.

```
1. 세션              — 없으면 로그인 유도 (미리보기와 다른 경로)
2. 토큰 유효성        — isValid(link). 무효면 LINK_INVALID
3. 본인 링크          — link.inviterId === session.userId 면 SELF_INVITE (FR-016)
4. 기존 활성 관계     — 있으면 ALREADY_FRIENDS (성사 화면 대신 친구 상세로)
5. 트랜잭션 {
     Friendship 생성 (status: ACTIVE, inviteLinkId, acceptedAt)
     FriendInviteLink.usedCount { increment: 1 }
     Notification 생성 (발급자에게, FRIEND_JOINED_VIA_LINK)
   }
```

> **5번이 한 트랜잭션이어야 하는 이유** (R5): 관계는 생겼는데 카운트가 안 오르면 발급자가 보는
> 숫자가 거짓이 되고(FR-006), 알림이 빠지면 승인 절차를 없앤 대가로 남긴 통제 수단이 사라진다(FR-017).
>
> **4번을 검사해도 5번이 유니크 위반으로 실패할 수 있다.** 두 사람이 서로의 링크를 동시에
> 여는 경우다. 위반(P2002)을 잡아 `ALREADY_FRIENDS`로 바꾼다 — 검사와 제약을 **둘 다** 둔다.
> 검사는 좋은 메시지를 위해, 제약은 정확성을 위해 있다.

### `removeFriend`

```
1. 세션
2. 활성 관계 확인 — 없으면 NOT_FRIENDS
3. status = REMOVED, removedAt = now, removedBy = session.userId
```

행을 지우지 않는다 (FR-026·FR-027). **M2에는 진행 중 거래가 없으므로 예외 분기가 없다** (R9).

### `markAllNotificationsRead`

읽지 않은 것만 갱신한다 — 이미 읽은 알림의 `readAt`을 덮어쓰면 언제 읽었는지가 사라진다.

---

## 3. 라우트

| 경로 | 인증 | 화면 | 비고 |
|---|---|---|---|
| `/friends` | 필요 | SCR-M2-01 친구 탭 | **다가오는 일정 없음** (clarify Q1) |
| `/friends/invite` | 필요 | SCR-M2-02 링크 발급·공유 | |
| `/friends/invite/manage` | 필요 | SCR-M2-03 링크 관리 | |
| `/friends/[userId]` | 필요 | SCR-M2-06 친구 상세 | `requireActiveFriendship` 통과 필수 |
| `/notifications` | 필요 | SCR-M3-02 알림 목록 | M2로 앞당김 (clarify Q4) |
| **`/i/[token]`** | **불필요** | SCR-M2-04 미리보기 / SCR-M2-05 성사 | **앱 셸 밖.** `proxy.ts` matcher에 넣지 않는다 (R1) |

### `proxy.ts` 변경

```ts
matcher: [
  '/onboarding/:path*', '/taste/:path*', '/my/:path*', '/signup/:path*',
  '/friends/:path*', '/notifications/:path*',   // 추가
]
```

`/i/:path*`는 **넣지 않는다.** matcher가 화이트리스트라 목록에 없으면 자동으로 공개다.

### `/i/[token]` 분기 (R3)

| 세션 | 상태 | 결과 |
|---|---|---|
| 없음 | 토큰 유효 | 미리보기 렌더 |
| 없음 | 토큰 무효 | 만료 안내 — **표시명도 노출하지 않음** |
| 있음 | 본인 링크 | "본인 링크입니다" — 성사하지 않음 |
| 있음 | 이미 활성 친구 | `/friends/[userId]`로 redirect |
| 있음 | 친구 아님 · 토큰 유효 | `acceptInvite` → 성사 화면 |
| 있음 | 토큰 무효 | 만료 안내. **가입은 유지** (FR-019) |

---

## 4. 클라이언트 컴포넌트 예산

constitution 원칙 III에 따라 `'use client'`는 아래로 한정한다. M1은 4개였고 M2는 **3개를 더한다.**

| 컴포넌트 | 왜 클라이언트인가 |
|---|---|
| `components/friend/invite-link-card.tsx` | 클립보드 복사와 OS 공유 호출 |
| `components/friend/remove-friend-dialog.tsx` | 확인 다이얼로그 상태 (M1의 `delete-confirm-dialog` 패턴) |
| `components/notification/notification-list.tsx` | 읽음 처리 후 낙관적 갱신 |

**목록 렌더는 Server Component로 유지한다** — 친구 목록, 친구 상세, 알림 목록의 데이터 렌더는
서버에서 한다. 클라이언트로 보내고 거기서 거르면 접근 제어가 무너진다.
