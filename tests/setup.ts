import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// vitest 를 globals 없이 쓰므로 @testing-library/react 의 자동 cleanup 이 등록되지 않는다.
// 없으면 렌더한 DOM 이 테스트 사이에 쌓여 두 번째 테스트부터 "Found multiple elements" 가 난다.
afterEach(cleanup)
