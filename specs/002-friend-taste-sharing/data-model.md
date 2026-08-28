# Data Model: 친구에게 취향이 전달된다 (마일스톤 2)

**Date**: 2026-08-28 | **Plan**: [plan.md](./plan.md) | **Research**: [research.md](./research.md)

M1의 스키마(`User` · `TasteProfile` · `Category` · `TasteItem`)는 **바꾸지 않는다.**
M2는 엔티티 3개를 더한다.

---

## 새 엔티티

### Friendship — 친구 관계

한 쌍당 **한 행**이다. 양방향으로 복제하지 않는다 (도메인 모델 §4).

| 필드 | 타입 | 제약 | 근거 |
|---|---|---|---|
| `id` | uuid | PK | |
| `requesterId` | uuid | FK `User` | 순서가 "누가 먼저 요청했나"를 담는다 = 링크 발급자 |
| `addresseeId` | uuid | FK `User` | 링크를 받은 쪽 |
| `status` | enum | `ACTIVE` \| `REMOVED` | 도메인 모델 3-3 |
| `inviteLinkId` | uuid? | FK `FriendInviteLink` | 어느 링크로 맺어졌는지 |
| `acceptedAt` | timestamp | | |
| `removedAt` | timestamp? | | D3 |
| `removedBy` | uuid? | FK `User` | 어느 쪽이 끊었는지 (FR-027) |

**인덱스**

```sql
-- C3: 같은 쌍의 중복 활성 관계 방지 (순서 무관) — FR-015
-- Prisma 문법으로 표현되지 않아 raw SQL 마이그레이션으로 넣는다 (R4).
CREATE UNIQUE INDEX friendship_pair_active
  ON "Friendship" (LEAST("requesterId", "addresseeId"), GREATEST("requesterId", "addresseeId"))
  WHERE status <> 'REMOVED';
```

- `@@index([requesterId, status])` · `@@index([addresseeId, status])` — 친구 목록 조회(FR-018).
  한 행이 양방향을 담으므로 **양쪽에서 찾아야 한다**

**제약 C4 — 자기 자신 금지** (FR-016)

```sql
ALTER TABLE "Friendship" ADD CONSTRAINT friendship_not_self
  CHECK ("requesterId" <> "addresseeId");
```

> 애플리케이션에서도 막지만 DB 제약을 함께 둔다. M1의 T010에서 배운 것 —
> 애플리케이션 검사만 있는 불변식은 조용히 새고, 새는 것을 화면으로는 알 수 없다.

**상태 전이**

```
(없음) --링크 성사--> ACTIVE --해제--> REMOVED
                                        |
                        재추가 --> (새 행) ACTIVE
```

`REMOVED`에서 `ACTIVE`로 되돌리는 전이는 **없다.** 재추가는 새 행이다 (R9, FR-026).

---

### FriendInviteLink — 친구 초대 링크

| 필드 | 타입 | 제약 | 근거 |
|---|---|---|---|
| `id` | uuid | PK | |
| `inviterId` | uuid | FK `User` | |
| `token` | string | **unique** | 32바이트 랜덤 base64url, 43자 (R2) |
| `expiresAt` | timestamp | | 발급 + 7일 (FR-003) |
| `revokedAt` | timestamp? | | 발급자가 즉시 중지 (FR-005) |
| `usedCount` | int | default 0 | 사용 인원수 (FR-006) |
| `createdAt` | timestamp | | |

- `@@index([inviterId])` — 발급자의 링크 목록(SCR-M2-03)
- **`usedCount`에 상한이 없다** — clarify Q2 결정. 만료 전까지 계속 성사된다

**유효성 판정** — 지연 평가다. 배치로 만료 처리하지 않는다 (도메인 모델 §8).

```
isValid(link) := link.revokedAt IS NULL AND link.expiresAt > now()
```

> FR-004("유효한 링크가 있으면 새로 발급하지 않는다")와 FR-007(만료·중지·부재를 구분 불가로)이
> **같은 판정식**을 쓴다. 한 곳에 두고 양쪽이 부른다.

---

### Notification — 알림

**원래 M3 엔티티였으나 M2로 앞당겼다** (clarify Q4). 도메인 모델 §5 그대로다.

| 필드 | 타입 | 제약 | 근거 |
|---|---|---|---|
| `id` | uuid | PK | |
| `userId` | uuid | FK `User` | 받는 사람 |
| `type` | enum | M2는 `FRIEND_JOINED_VIA_LINK` 하나 | 나머지 10종은 M3·M4에서 추가 (R6) |
| `payload` | Json | | 관련 엔티티 id와 표시용 값 |
| `readAt` | timestamp? | | 미읽음 구분 (FR-030) |
| `createdAt` | timestamp | | 최신순 정렬 (FR-029) |

- `@@index([userId, createdAt])` — 목록 조회
- `@@index([userId, readAt])` — 미읽음 개수

**`payload` 의 M2 형태**

```json
{
  "friendshipId": "…",
  "friendUserId": "…",
  "friendDisplayName": "김민수"
}
```

> **표시용 값을 복사해 넣는다.** `friendDisplayName`을 조회 시점에 `User`에서 읽어오면,
> 친구를 해제한 뒤 그 알림을 볼 때 이름을 얻으려고 관계 없는 사용자를 조회하게 된다.
> constitution 원칙 IV(거래는 스냅샷으로 자립한다)의 같은 논리다 — 알림도 발생 시점의
> 사실이므로 자기 안에 필요한 값을 갖는다.
>
> **탭 이동(FR-032)은 별개다.** `friendUserId`로 이동하되 그 화면은
> `requireActiveFriendship()`을 통과해야 한다. 해제된 뒤에는 거부된다 — 알림 존재가
> 접근 권한을 만들지 않는다(스펙 Edge Case).

---

## 조회 규칙

### 접근 제어 — 단일 규칙

```
canViewTasteProfile(viewer, owner) := ∃ Friendship
  WHERE status = 'ACTIVE'
    AND {requesterId, addresseeId} = {viewer, owner}
```

constitution "데이터 보호"에 따라 **`lib/dal/friend.ts`의 함수 하나**에 둔다. 항목별 분기 없음.

### 미리보기 — 별도 경로

```
canViewPreview(token) := isValid(link)
  --> 노출: displayName · avatarUrl · 대표 태그 최대 3건
```

취향 항목·취향 서술은 노출하지 않는다 (FR-009).

### 대표 태그

```
representativeTags(userId) :=
  TasteItem WHERE profile.userId = userId AND kind = 'WANT'
  ORDER BY createdAt DESC
  LIMIT 3
  --> Category.name 목록
```

3건 미만이면 있는 만큼, 0건이면 빈 목록 (FR-012). **다른 `kind`로 채우지 않는다.**
친구 목록에서는 N+1을 피해 한 번에 모아 가져온다 (R7).

---

## M1 스키마에 미치는 영향

| 대상 | 변경 |
|---|---|
| `User` | 없음. `Friendship`·`Notification`의 역참조 관계만 추가 |
| `TasteProfile` | **없음** |
| `TasteItem` | **없음** |
| `Category` | **없음** |

> M2는 취향 데이터를 **읽기만 한다.** 마이그레이션이 M1 데이터를 건드리지 않으므로
> 기존 사용자의 취향이 영향받지 않는다.

---

## 마이그레이션 순서

1. `Friendship` · `FriendInviteLink` · `Notification` 모델과 enum 2종 추가 → `migrate dev`
2. **raw SQL 마이그레이션** — `friendship_pair_active` partial unique index (C3)
3. **raw SQL 마이그레이션** — `friendship_not_self` CHECK (C4)
4. C3·C4가 실제로 걸렸는지 확인하는 통합 테스트

> **4번을 건너뛰지 않는다.** M1의 T010(제약)과 T011(검증)이 짝이었던 이유와 같다.
> 제약이 안 걸린 상태는 화면상 완전히 정상으로 보이고, 나중에 중복 관계가 쌓인 뒤에야 드러난다.
>
> 마이그레이션은 **한 사람만 만든다.** 여러 명이 만들면 순서가 갈려 팀 전원의 로컬 DB가
> 어긋난다 (M1 협업 규칙).
