import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    // E2E는 Playwright가 담당한다 (research.md R5).
    // async Server Component는 Vitest가 지원하지 않으므로 여기서 수집하지 않는다.
    //
    // 단위와 통합을 나눈 이유는 **예산**이다 (T029). 단위는 전부 목이라 5초 기본값이
    // 맞지만, 통합은 실제 Supabase(ap-southeast-2)를 왕복한다 — 한 테스트가 사용자 2명 ·
    // 초대 · 관계 · 알림을 순서대로 만들면 5초를 넘긴다. T018 의 ALREADY_FRIENDS 케이스가
    // 정확히 그랬다: 결함이 아니라 7.4초짜리 테스트에 5초를 준 것이었다.
    // 단위까지 같이 올리면 진짜로 멈춘 단위 테스트를 5초가 아니라 30초 뒤에 알게 된다.
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: ['tests/unit/**/*.test.{ts,tsx}'] },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.{ts,tsx}'],
          testTimeout: 30_000,
        },
      },
    ],
  },
})
