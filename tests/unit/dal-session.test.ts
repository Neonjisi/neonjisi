/**
 * T016·T017 — lib/dal/session.ts 단위 테스트
 *
 * 계약: specs/001-taste-profile/contracts/server-actions.md
 *  - verifySession(): 세션 없음 → /login redirect. 성공 → { userId }.
 *    부수효과: User 행이 없으면 생성한다 (get-or-create, research R2)
 *  - requireOnboarded(): 온보딩 미완료 → /onboarding redirect.
 *    성공 → { profileId, onboardedAt } (FR-018의 권위 있는 판정 지점)
 *
 * M2 (T011) — 계약: specs/002-friend-taste-sharing/contracts/server-actions.md §1
 *  - getOptionalSession(): 세션 없음 → **null 반환, redirect 하지 않는다** (research R3).
 *    미리보기 라우트(/i/[token]) 전용 — verifySession() 과의 차이는 redirect 뿐이다.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => {
  class RedirectError extends Error {
    constructor(readonly url: string) {
      super(`REDIRECT:${url}`)
    }
  }
  return {
    RedirectError,
    getClaims: vi.fn(),
    userFindUnique: vi.fn(),
    userCreate: vi.fn(),
    profileFindUnique: vi.fn(),
    redirect: vi.fn((url: string): never => {
      throw new RedirectError(url)
    }),
  }
})

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: { getClaims: h.getClaims },
  })),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: h.userFindUnique, create: h.userCreate },
    tasteProfile: { findUnique: h.profileFindUnique },
  },
}))

vi.mock('next/navigation', () => ({ redirect: h.redirect }))

// React cache() 메모이즈는 RSC 런타임 동작이라 여기서 검증하지 않는다.
// 테스트 간 결과가 새지 않도록 passthrough 로 고정한다.
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  cache: <T,>(fn: T) => fn,
}))

import { getOptionalSession, requireOnboarded, verifySession } from '@/lib/dal/session'

const USER_ID = '0b9f8a1e-1111-4222-8333-444455556666'

function givenSession() {
  h.getClaims.mockResolvedValue({
    data: {
      claims: {
        sub: USER_ID,
        email: 'd@example.com',
        user_metadata: { full_name: '디', avatar_url: 'https://a.example/1.png' },
      },
    },
    error: null,
  })
}

function givenNoSession() {
  h.getClaims.mockResolvedValue({ data: null, error: null })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('verifySession', () => {
  it('세션이 없으면 /login 으로 redirect 한다', async () => {
    givenNoSession()

    await expect(verifySession()).rejects.toBeInstanceOf(h.RedirectError)

    expect(h.redirect).toHaveBeenCalledWith('/login')
    expect(h.userFindUnique).not.toHaveBeenCalled()
    expect(h.userCreate).not.toHaveBeenCalled()
  })

  it('세션이 있고 User 행이 있으면 userId 를 반환하고 생성하지 않는다', async () => {
    givenSession()
    h.userFindUnique.mockResolvedValue({ id: USER_ID })

    const session = await verifySession()

    expect(session).toEqual({ userId: USER_ID })
    expect(h.userCreate).not.toHaveBeenCalled()
    expect(h.redirect).not.toHaveBeenCalled()
  })

  it('세션은 있는데 User 행이 없으면 그 자리에서 생성한다 (get-or-create)', async () => {
    givenSession()
    h.userFindUnique.mockResolvedValue(null)
    h.userCreate.mockResolvedValue({ id: USER_ID })

    const session = await verifySession()

    expect(session).toEqual({ userId: USER_ID })
    expect(h.userCreate).toHaveBeenCalledTimes(1)
    const createArg = h.userCreate.mock.calls[0][0]
    expect(createArg.data.id).toBe(USER_ID)
    expect(createArg.data.displayName).toBe('디')
    expect(createArg.data.avatarUrl).toBe('https://a.example/1.png')
  })

  it('동시 요청 경합으로 생성이 유니크 위반(P2002)이면 무시하고 성공한다', async () => {
    givenSession()
    h.userFindUnique.mockResolvedValue(null)
    h.userCreate.mockRejectedValue(
      Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
    )

    await expect(verifySession()).resolves.toEqual({ userId: USER_ID })
  })

  it('메타데이터에 이름이 없으면 이메일을 표시명으로 쓴다', async () => {
    h.getClaims.mockResolvedValue({
      data: { claims: { sub: USER_ID, email: 'd@example.com', user_metadata: {} } },
      error: null,
    })
    h.userFindUnique.mockResolvedValue(null)
    h.userCreate.mockResolvedValue({ id: USER_ID })

    await verifySession()

    expect(h.userCreate.mock.calls[0][0].data.displayName).toBe('d@example.com')
  })
})

describe('getOptionalSession', () => {
  it('세션이 없으면 null 을 반환하고 redirect 하지 않는다 — 비가입자 미리보기의 전제 (FR-008)', async () => {
    givenNoSession()

    await expect(getOptionalSession()).resolves.toBeNull()

    expect(h.redirect).not.toHaveBeenCalled()
    expect(h.userFindUnique).not.toHaveBeenCalled()
  })

  it('getClaims 가 오류를 돌려줘도 null 로 취급한다 — 예외도 redirect 도 아니다', async () => {
    h.getClaims.mockResolvedValue({ data: null, error: new Error('bad token') })

    await expect(getOptionalSession()).resolves.toBeNull()

    expect(h.redirect).not.toHaveBeenCalled()
  })

  it('세션이 있으면 verifySession 과 같은 userId 를 반환한다', async () => {
    givenSession()
    h.userFindUnique.mockResolvedValue({ id: USER_ID })

    await expect(getOptionalSession()).resolves.toEqual({ userId: USER_ID })

    expect(h.redirect).not.toHaveBeenCalled()
    expect(h.userCreate).not.toHaveBeenCalled()
  })

  it('세션은 있는데 User 행이 없으면 생성한다 — 링크로 바로 들어온 로그인 사용자의 성사(FK)를 보장', async () => {
    givenSession()
    h.userFindUnique.mockResolvedValue(null)
    h.userCreate.mockResolvedValue({ id: USER_ID })

    await expect(getOptionalSession()).resolves.toEqual({ userId: USER_ID })

    expect(h.userCreate).toHaveBeenCalledTimes(1)
  })
})

describe('requireOnboarded', () => {
  const PROFILE_ID = 'aaaa1111-2222-4333-8444-555566667777'

  it('온보딩이 완료된 프로필이면 profileId 와 onboardedAt 을 반환한다', async () => {
    givenSession()
    h.userFindUnique.mockResolvedValue({ id: USER_ID })
    const onboardedAt = new Date('2026-08-27T09:00:00Z')
    h.profileFindUnique.mockResolvedValue({ id: PROFILE_ID, onboardedAt })

    const summary = await requireOnboarded()

    expect(summary).toEqual({ profileId: PROFILE_ID, onboardedAt })
    expect(h.redirect).not.toHaveBeenCalled()
  })

  it('프로필이 아직 없으면 /onboarding 으로 redirect 한다', async () => {
    givenSession()
    h.userFindUnique.mockResolvedValue({ id: USER_ID })
    h.profileFindUnique.mockResolvedValue(null)

    await expect(requireOnboarded()).rejects.toBeInstanceOf(h.RedirectError)

    expect(h.redirect).toHaveBeenCalledWith('/onboarding')
  })

  it('onboardedAt 이 비어 있으면 /onboarding 으로 redirect 한다', async () => {
    givenSession()
    h.userFindUnique.mockResolvedValue({ id: USER_ID })
    h.profileFindUnique.mockResolvedValue({ id: PROFILE_ID, onboardedAt: null })

    await expect(requireOnboarded()).rejects.toBeInstanceOf(h.RedirectError)

    expect(h.redirect).toHaveBeenCalledWith('/onboarding')
  })

  it('세션이 없으면 verifySession 이 먼저 /login 으로 보낸다', async () => {
    givenNoSession()

    await expect(requireOnboarded()).rejects.toBeInstanceOf(h.RedirectError)

    expect(h.redirect).toHaveBeenCalledWith('/login')
    expect(h.profileFindUnique).not.toHaveBeenCalled()
  })
})
