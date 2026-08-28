import { defineConfig, devices } from '@playwright/test'

/**
 * async Server Component 화면은 Vitest가 지원하지 않으므로 E2E가 담당한다 (research.md R5).
 * 수용 시나리오(spec.md US1~US4)는 전부 여기서 검증한다.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  // 인증 E2E 는 테스트 계정 **하나**를 공유하고 매 테스트마다 그 계정의 데이터를 UI 로
  // 지우고 다시 만든다 (tests/e2e/fixtures/auth.ts · taste-ui.ts). 워커가 둘 이상이면
  // 서로의 상태를 지우므로 직렬로 돌린다.
  workers: 1,
  // dev 서버가 라우트를 처음 컴파일하는 시간 + UI 로 하는 상태 초기화(beforeEach)를 감안한다.
  timeout: 90_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // SC-006: 폭 360px에서 가로 스크롤 없이 동작해야 한다
    { name: 'mobile-360', use: { ...devices['Pixel 5'], viewport: { width: 360, height: 800 } } },
  ],
  // 개발 서버를 Playwright가 직접 띄운다. 이미 떠 있으면 재사용한다.
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
