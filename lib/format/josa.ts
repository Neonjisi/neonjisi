/**
 * 한글 조사 선택 — 앞말의 마지막 글자 받침 유무로 고른다.
 *
 * 완성형 한글 음절(가–힣, U+AC00–U+D7A3)은 (code - 0xAC00) % 28 이 0 이 아니면 받침이 있다.
 * 마지막 글자가 한글 음절이 아니면(영문·숫자·기호·자모) 판정하지 않는다 — 그 경우
 * josa() 는 "을(를)" 처럼 병기해 틀린 조사를 붙이는 것보다 안전한 쪽을 택한다.
 */

const HANGUL_SYLLABLE_START = 0xac00
const HANGUL_SYLLABLE_END = 0xd7a3
const JONGSEONG_COUNT = 28

/** 받침이 있으면 true, 없으면 false, 마지막 글자가 한글 음절이 아니면 null */
export function hasBatchim(word: string): boolean | null {
  const trimmed = word.trimEnd()
  if (trimmed.length === 0) return null
  const code = trimmed.charCodeAt(trimmed.length - 1)
  if (code < HANGUL_SYLLABLE_START || code > HANGUL_SYLLABLE_END) return null
  return (code - HANGUL_SYLLABLE_START) % JONGSEONG_COUNT !== 0
}

/**
 * 앞말에 맞는 조사를 돌려준다 — `josa('책', '을', '를')` → `'을'`.
 * 판정할 수 없으면 `'을(를)'` 로 병기한다.
 */
export function josa(word: string, withBatchim: string, withoutBatchim: string): string {
  const batchim = hasBatchim(word)
  if (batchim === null) return `${withBatchim}(${withoutBatchim})`
  return batchim ? withBatchim : withoutBatchim
}
