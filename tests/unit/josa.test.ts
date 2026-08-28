/**
 * lib/format/josa.ts 단위 테스트 — 앞말의 받침 유무로 조사(을/를)를 고른다.
 * 완성형 한글 음절은 (code - 0xAC00) % 28 이 0 이 아니면 받침이 있다.
 * 한글이 아니면 판정하지 않고 "을(를)" 로 병기한다.
 */
import { describe, expect, it } from 'vitest'
import { hasBatchim, josa } from '@/lib/format/josa'

describe('hasBatchim', () => {
  it('받침이 있는 글자로 끝나면 true', () => {
    expect(hasBatchim('책')).toBe(true)
    expect(hasBatchim('머그컵·유리컵')).toBe(true)
    expect(hasBatchim('차·티백')).toBe(true)
  })

  it('받침이 없는 글자로 끝나면 false', () => {
    expect(hasBatchim('텀블러')).toBe(false)
    expect(hasBatchim('과일 선물세트')).toBe(false)
    expect(hasBatchim('향수')).toBe(false)
  })

  it('마지막 글자가 한글 음절이 아니면 null — 영문·숫자·기호·빈 문자열', () => {
    expect(hasBatchim('PC')).toBeNull()
    expect(hasBatchim('아이폰 15')).toBeNull()
    expect(hasBatchim('')).toBeNull()
    expect(hasBatchim('ㄱ')).toBeNull()
  })

  it('끝의 공백은 무시한다', () => {
    expect(hasBatchim('책  ')).toBe(true)
    expect(hasBatchim('텀블러 ')).toBe(false)
  })
})

describe('josa', () => {
  it('받침이 있으면 을, 없으면 를', () => {
    expect(josa('책', '을', '를')).toBe('을')
    expect(josa('텀블러', '을', '를')).toBe('를')
  })

  it('판정할 수 없으면 "을(를)" 로 병기한다', () => {
    expect(josa('PC', '을', '를')).toBe('을(를)')
    expect(josa('', '을', '를')).toBe('을(를)')
  })

  it('다른 조사 쌍에도 같은 규칙을 적용한다', () => {
    expect(josa('책', '이', '가')).toBe('이')
    expect(josa('텀블러', '은', '는')).toBe('는')
  })
})
