import { describe, expect, it } from 'vitest'
import { DISPLAY_NAME_MAX_LENGTH, profileInputSchema } from '@/lib/validation/profile'

describe('프로필 이름 검증', () => {
  it('앞뒤 공백을 제거한 이름을 반환한다', () => {
    expect(profileInputSchema.parse({ displayName: '  지상  ' }).displayName).toBe('지상')
  })

  it('빈 이름을 거부한다', () => {
    expect(profileInputSchema.safeParse({ displayName: '   ' }).success).toBe(false)
  })

  it(`${DISPLAY_NAME_MAX_LENGTH}자를 넘는 이름을 거부한다`, () => {
    expect(
      profileInputSchema.safeParse({ displayName: '가'.repeat(DISPLAY_NAME_MAX_LENGTH + 1) }).success,
    ).toBe(false)
  })
})
