import { defineConfig, devices } from '@playwright/test'

/**
 * async Server Component 화면은 Vitest가 지원하지 않으므로 E2E가 담당한다 (research.md R5).
 * 수용 시나리오(spec.md US1~US4)는 전부 여기서 검증한다.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
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
