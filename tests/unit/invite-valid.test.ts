// @vitest-environment node
/**
 * T014 — lib/dal/invite.ts `isValid()` 단위 테스트
 *
 * 계약: specs/002-friend-taste-sharing/data-model.md "유효성 판정"
 *   isValid(link) := link.revokedAt IS NULL AND link.expiresAt > now
 *
 * FR-004(유효한 링크가 있으면 새로 발급하지 않는다)와 FR-007(만료·중지·부재를 구분하지
 * 않는다)이 같은 판정식을 쓴다. 판정식이 한 곳에만 있어야 하므로 경계를 여기서 못박는다.
 *
 * node 환경인 이유: jsdom(web) 변환 모드에서는 vite 가 존재하지 않는 import 를 변환 단계에서
 * 거부한다. `lib/dal/invite.ts` 가 의존하는 `@/lib/invite/token`(T010)·`@/lib/dal/friend`(T022)는
 * 팀원 몫이라 이 브랜치에 없을 수 있어, 아래에서 팩토리 mock 으로 대신한다.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/dal/session', () => ({ verifySession: vi.fn() }))
vi.mock('@/lib/invite/token', () => ({ generateInviteToken: vi.fn() }))
vi.mock('@/lib/dal/friend', () => ({ getRepresentativeTags: vi.fn() }))

import { isValid } from '@/lib/dal/invite'

const NOW = new Date('2026-08-28T12:00:00.000Z')
const ms = (delta: number) => new Date(NOW.getTime() + delta)

describe('isValid', () => {
  it('중지되지 않았고 만료 시각이 아직 지나지 않았으면 유효하다', () => {
    expect(isValid({ revokedAt: null, expiresAt: ms(+1) }, NOW)).toBe(true)
  })

  it('만료 시각과 현재가 같으면 무효다 — 판정식은 strict greater-than', () => {
    expect(isValid({ revokedAt: null, expiresAt: ms(0) }, NOW)).toBe(false)
  })

  it('만료 시각이 1ms 라도 지났으면 무효다', () => {
    expect(isValid({ revokedAt: null, expiresAt: ms(-1) }, NOW)).toBe(false)
  })

  it('중지(revokedAt)되었으면 만료 전이라도 무효다', () => {
    expect(isValid({ revokedAt: ms(-60_000), expiresAt: ms(+7 * 24 * 3600_000) }, NOW)).toBe(false)
  })

  it('중지되고 만료까지 된 링크는 당연히 무효다', () => {
    expect(isValid({ revokedAt: ms(-60_000), expiresAt: ms(-1) }, NOW)).toBe(false)
  })

  it('now 를 생략하면 현재 시각으로 판정한다', () => {
    const inOneHour = new Date(Date.now() + 3600_000)
    const oneHourAgo = new Date(Date.now() - 3600_000)
    expect(isValid({ revokedAt: null, expiresAt: inOneHour })).toBe(true)
    expect(isValid({ revokedAt: null, expiresAt: oneHourAgo })).toBe(false)
  })
})
