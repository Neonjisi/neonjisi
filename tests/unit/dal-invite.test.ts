// @vitest-environment node
/**
 * T020·T021·T041 — lib/dal/invite.ts 단위 테스트
 *
 * 계약: specs/002-friend-taste-sharing/contracts/server-actions.md §1
 *  - getOrCreateActiveInviteLink(): 본인 세션. 유효한 링크가 있으면 그것을 반환, 없으면 발급 (FR-004)
 *  - getPreview(token): 세션 없음(공개). 유효하면 표시명·이미지·대표 태그, 무효면 null.
 *    만료·중지·부재를 구분하지 않는다 (FR-007). 취향 항목·서술은 내보내지 않는다 (FR-009)
 *  - getMyInviteLinks(): 본인 세션. 사용 중 + 지난 링크, createdAt desc, 각 항목에 isValid
 *
 * node 환경인 이유는 invite-valid.test.ts 머리말 참조 (팀원 몫 모듈 부재 대비).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  verifySession: vi.fn(),
  linkFindMany: vi.fn(),
  linkFindUnique: vi.fn(),
  linkCreate: vi.fn(),
  userFindUnique: vi.fn(),
  generateInviteToken: vi.fn(),
  getRepresentativeTags: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    friendInviteLink: { findMany: h.linkFindMany, findUnique: h.linkFindUnique, create: h.linkCreate },
    user: { findUnique: h.userFindUnique },
  },
}))
vi.mock('@/lib/dal/session', () => ({ verifySession: h.verifySession }))
vi.mock('@/lib/invite/token', () => ({ generateInviteToken: h.generateInviteToken }))
vi.mock('@/lib/dal/friend', () => ({ getRepresentativeTags: h.getRepresentativeTags }))

// React cache() 메모이즈는 RSC 런타임 동작이라 여기서 검증하지 않는다.
// 테스트 간 결과가 새지 않도록 passthrough 로 고정한다.
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  cache: <T,>(fn: T) => fn,
}))

import { getMyInviteLinks, getOrCreateActiveInviteLink, getPreview } from '@/lib/dal/invite'

const USER_ID = '0b9f8a1e-1111-4222-8333-444455556666'
const OTHER_ID = '9f9f9f9f-2222-4333-8444-555566667777'
const NOW = new Date('2026-08-28T12:00:00.000Z')
const DAY = 24 * 3600_000
const at = (delta: number) => new Date(NOW.getTime() + delta)
const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCdE' // 43자 base64url (R2)

type Row = {
  id: string
  inviterId: string
  token: string
  expiresAt: Date
  revokedAt: Date | null
  usedCount: number
  createdAt: Date
}

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: 'link-1',
    inviterId: USER_ID,
    token: TOKEN,
    expiresAt: at(+3 * DAY),
    revokedAt: null,
    usedCount: 0,
    createdAt: at(-4 * DAY),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  h.verifySession.mockResolvedValue({ userId: USER_ID })
  h.generateInviteToken.mockReturnValue(TOKEN)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('getOrCreateActiveInviteLink', () => {
  it('유효한 링크가 있으면 그것을 반환하고 새로 발급하지 않는다 (FR-004)', async () => {
    const active = row({ id: 'link-active', usedCount: 2 })
    h.linkFindMany.mockResolvedValue([active])

    const view = await getOrCreateActiveInviteLink()

    expect(view).toEqual({
      id: 'link-active',
      token: TOKEN,
      expiresAt: active.expiresAt,
      revokedAt: null,
      usedCount: 2,
      isValid: true,
    })
    expect(h.linkCreate).not.toHaveBeenCalled()
    expect(h.generateInviteToken).not.toHaveBeenCalled()
  })

  it('본인 링크만 찾는다 — where 에 세션 userId 가 들어간다', async () => {
    h.linkFindMany.mockResolvedValue([row()])

    await getOrCreateActiveInviteLink()

    expect(h.linkFindMany).toHaveBeenCalledTimes(1)
    expect(h.linkFindMany.mock.calls[0][0].where).toEqual({ inviterId: USER_ID })
  })

  it('있는 링크가 전부 만료·중지 상태면 새로 발급한다 — expiresAt = now + 7일', async () => {
    h.linkFindMany.mockResolvedValue([
      row({ id: 'expired', expiresAt: at(-1) }),
      row({ id: 'revoked', revokedAt: at(-DAY) }),
    ])
    const created = row({ id: 'link-new', expiresAt: at(+7 * DAY), createdAt: NOW })
    h.linkCreate.mockResolvedValue(created)

    const view = await getOrCreateActiveInviteLink()

    expect(h.linkCreate).toHaveBeenCalledTimes(1)
    expect(h.linkCreate.mock.calls[0][0].data).toEqual({
      inviterId: USER_ID,
      token: TOKEN,
      expiresAt: at(+7 * DAY),
    })
    expect(view.id).toBe('link-new')
    expect(view.isValid).toBe(true)
  })

  it('링크가 하나도 없으면 발급한다', async () => {
    h.linkFindMany.mockResolvedValue([])
    h.linkCreate.mockResolvedValue(row({ id: 'first', expiresAt: at(+7 * DAY), createdAt: NOW }))

    const view = await getOrCreateActiveInviteLink()

    expect(h.linkCreate).toHaveBeenCalledTimes(1)
    expect(view.id).toBe('first')
  })

  it('토큰은 lib/invite/token 이 만든 것을 그대로 쓴다 — 직접 만들지 않는다 (R2)', async () => {
    h.linkFindMany.mockResolvedValue([])
    h.generateInviteToken.mockReturnValue('from-token-module')
    h.linkCreate.mockImplementation(async ({ data }: { data: Partial<Row> }) =>
      row({ id: 'x', ...data, createdAt: NOW }),
    )

    const view = await getOrCreateActiveInviteLink()

    expect(h.generateInviteToken).toHaveBeenCalledTimes(1)
    expect(view.token).toBe('from-token-module')
  })

  it('세션이 없으면 verifySession 의 redirect 가 그대로 전파되고 DB 를 건드리지 않는다', async () => {
    const redirectError = new Error('REDIRECT:/login')
    h.verifySession.mockRejectedValue(redirectError)

    await expect(getOrCreateActiveInviteLink()).rejects.toBe(redirectError)

    expect(h.linkFindMany).not.toHaveBeenCalled()
    expect(h.linkCreate).not.toHaveBeenCalled()
  })
})

describe('getPreview', () => {
  function givenValidLink() {
    h.linkFindUnique.mockResolvedValue(row({ inviterId: OTHER_ID }))
    h.userFindUnique.mockResolvedValue({ displayName: '김민수', avatarUrl: 'https://a.example/m.png' })
    h.getRepresentativeTags.mockResolvedValue(['캠핑', '커피', '러닝'])
  }

  it('유효한 토큰이면 발급자의 표시명·이미지·대표 태그를 돌려준다 (FR-008)', async () => {
    givenValidLink()

    const preview = await getPreview(TOKEN)

    expect(preview).toEqual({
      inviterUserId: OTHER_ID,
      displayName: '김민수',
      avatarUrl: 'https://a.example/m.png',
      tags: ['캠핑', '커피', '러닝'],
    })
    expect(h.linkFindUnique.mock.calls[0][0].where).toEqual({ token: TOKEN })
    expect(h.getRepresentativeTags).toHaveBeenCalledWith(OTHER_ID)
  })

  it('세션을 요구하지 않는다 — 비가입자도 미리보기를 본다 (FR-008)', async () => {
    givenValidLink()

    await getPreview(TOKEN)

    expect(h.verifySession).not.toHaveBeenCalled()
  })

  it('취향 항목·서술은 절대 내보내지 않는다 — 계약의 네 키만 있다 (FR-009)', async () => {
    givenValidLink()

    const preview = await getPreview(TOKEN)

    expect(Object.keys(preview!).sort()).toEqual(['avatarUrl', 'displayName', 'inviterUserId', 'tags'])
  })

  it('대표 태그가 0건이면 빈 배열 그대로다 — 다른 kind 로 채우지 않는다 (FR-012)', async () => {
    givenValidLink()
    h.getRepresentativeTags.mockResolvedValue([])

    const preview = await getPreview(TOKEN)

    expect(preview?.tags).toEqual([])
  })

  it.each([
    ['부재', null],
    ['만료', row({ inviterId: OTHER_ID, expiresAt: at(-1) })],
    ['중지', row({ inviterId: OTHER_ID, revokedAt: at(-DAY) })],
    ['만료 시각 정각', row({ inviterId: OTHER_ID, expiresAt: NOW })],
  ])('%s 토큰이면 null — 사용자·태그를 조회하지 않아 구분 힌트가 없다 (FR-007)', async (_label, found) => {
    h.linkFindUnique.mockResolvedValue(found)

    const preview = await getPreview(TOKEN)

    expect(preview).toBeNull()
    expect(h.userFindUnique).not.toHaveBeenCalled()
    expect(h.getRepresentativeTags).not.toHaveBeenCalled()
  })

  it('발급자 User 행이 없으면(비정상) null 로 취급한다 — 표시명을 지어내지 않는다', async () => {
    h.linkFindUnique.mockResolvedValue(row({ inviterId: OTHER_ID }))
    h.userFindUnique.mockResolvedValue(null)
    h.getRepresentativeTags.mockResolvedValue([])

    await expect(getPreview(TOKEN)).resolves.toBeNull()
  })
})

describe('getMyInviteLinks', () => {
  it('본인 링크를 createdAt desc 로 요청하고 각 항목에 isValid 를 붙인다', async () => {
    const active = row({ id: 'active', createdAt: at(-1 * DAY) })
    const revoked = row({ id: 'revoked', revokedAt: at(-2 * DAY), createdAt: at(-3 * DAY), usedCount: 5 })
    const expired = row({ id: 'expired', expiresAt: at(-8 * DAY), createdAt: at(-15 * DAY), usedCount: 1 })
    h.linkFindMany.mockResolvedValue([active, revoked, expired])

    const views = await getMyInviteLinks()

    expect(h.linkFindMany.mock.calls[0][0]).toMatchObject({
      where: { inviterId: USER_ID },
      orderBy: { createdAt: 'desc' },
    })
    expect(views.map((v) => [v.id, v.isValid])).toEqual([
      ['active', true],
      ['revoked', false],
      ['expired', false],
    ])
    expect(views[1]).toEqual({
      id: 'revoked',
      token: TOKEN,
      expiresAt: revoked.expiresAt,
      revokedAt: revoked.revokedAt,
      usedCount: 5,
      isValid: false,
    })
  })

  it('링크가 없으면 빈 배열이다', async () => {
    h.linkFindMany.mockResolvedValue([])

    await expect(getMyInviteLinks()).resolves.toEqual([])
  })

  it('세션이 없으면 verifySession 의 redirect 가 그대로 전파된다', async () => {
    const redirectError = new Error('REDIRECT:/login')
    h.verifySession.mockRejectedValue(redirectError)

    await expect(getMyInviteLinks()).rejects.toBe(redirectError)
    expect(h.linkFindMany).not.toHaveBeenCalled()
  })
})
