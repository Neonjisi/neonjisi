import { cache } from 'react'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * 세션 DAL (T016·T017) — 계약: specs/001-taste-profile/contracts/server-actions.md
 *
 * 모든 데이터 접근 진입점이 이 층을 지난다. M1 에는 RLS 2차 방어선이 없으므로
 * 여기서 인가를 통과한 결과만 밖으로 나간다 (research R4).
 */

export type Session = { userId: string }

export type TasteProfileSummary = { profileId: string; onboardedAt: Date }

type SessionClaims = {
  sub: string
  email?: string
  user_metadata?: Record<string, unknown>
}

const FALLBACK_DISPLAY_NAME = '이름 미설정'

/**
 * M2 T011 — 세션을 **선택적으로** 읽는다. 세션이 없으면 null 을 반환하고 redirect 하지 않는다.
 * 미리보기 라우트(/i/[token]) 전용이다 (M2 research R3, FR-008) — 그 외에는 verifySession() 을 쓴다.
 * 부수효과: 세션이 있으면 `User` 행이 없을 때 그 자리에서 만든다 (get-or-create, research R2) —
 * 로그인 콜백을 타지 않고 링크로 바로 들어온 사용자도 성사(FK)가 성립해야 한다.
 *
 * React cache() 메모이즈: 한 렌더 패스에서 여러 컴포넌트가 불러도 조회는 1회다.
 */
export const getOptionalSession = cache(async (): Promise<Session | null> => {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.getClaims()

  const claims = (data?.claims ?? null) as SessionClaims | null
  if (error || claims === null || !claims.sub) {
    return null
  }

  await ensureUserRow(claims)

  return { userId: claims.sub }
})

/**
 * 로그인 세션을 확인한다. 세션이 없으면 /login 으로 redirect.
 * getOptionalSession() 과의 차이는 이 redirect 하나뿐이다 — 미리보기에는 이 함수를 쓰면
 * 비가입자가 /login 으로 튕겨 FR-008 이 깨진다 (M2 계약 §1의 경고).
 */
export const verifySession = cache(async (): Promise<Session> => {
  const session = await getOptionalSession()
  if (session === null) {
    redirect('/login')
  }
  return session
})

/**
 * FR-018 의 권위 있는 판정 지점. 취향 데이터가 필요한 모든 진입점이 부른다.
 * 온보딩 미완료(프로필 없음 또는 onboardedAt 없음)면 /onboarding 으로 redirect.
 */
export const requireOnboarded = cache(async (): Promise<TasteProfileSummary> => {
  const { userId } = await verifySession()

  const profile = await prisma.tasteProfile.findUnique({
    where: { userId },
    select: { id: true, onboardedAt: true },
  })

  if (!profile?.onboardedAt) {
    redirect('/onboarding')
  }

  return { profileId: profile.id, onboardedAt: profile.onboardedAt }
})

async function ensureUserRow(claims: SessionClaims): Promise<void> {
  const existing = await prisma.user.findUnique({
    where: { id: claims.sub },
    select: { id: true },
  })
  if (existing) return

  const meta = claims.user_metadata ?? {}
  const displayName =
    firstNonEmptyString(meta.full_name, meta.name, meta.user_name) ??
    claims.email ??
    FALLBACK_DISPLAY_NAME
  const avatarUrl = firstNonEmptyString(meta.avatar_url, meta.picture)

  try {
    await prisma.user.create({ data: { id: claims.sub, displayName, avatarUrl } })
  } catch (e) {
    // 동시 요청이 먼저 만들었으면(P2002 유니크 위반) 그대로 진행한다.
    // Prisma 에러 클래스 대신 코드로 판별한다 — 버전 간 생성자 시그니처 변동을 피한다.
    if ((e as { code?: string }).code !== 'P2002') throw e
  }
}

function firstNonEmptyString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) return value
  }
  return null
}
