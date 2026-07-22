import { test, expect } from './fixtures'

// better-auth 초기화에 필요한 서버 env가 갖춰진 경우에만 인증 리다이렉트를 검증한다
// (login.spec 와 동일한 게이팅). 서버는 .env.local 을 로드하지만 CI 안전을 위해 게이트.
const hasAuthEnv = !!process.env.DISCORD_CLIENT_ID

test.describe('내 대시보드 (인증)', () => {
  test('미로그인 시 /login 으로 리다이렉트된다', async ({ page }) => {
    test.skip(!hasAuthEnv, '인증 env 필요')
    await page.goto('/dashboard/me')
    await expect(page).toHaveURL(/\/login/)
  })

  test('/dashboard 인덱스는 /dashboard/me 를 거쳐 로그인으로 유도된다', async ({ page }) => {
    test.skip(!hasAuthEnv, '인증 env 필요')
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login/)
  })

  test('로그인 유도 시 callbackUrl(/dashboard/me)이 보존된다', async ({ page }) => {
    test.skip(!hasAuthEnv, '인증 env 필요')
    await page.goto('/dashboard/me')
    await expect(page).toHaveURL(/callbackUrl=(%2F|\/)dashboard(%2F|\/)me/)
  })
})
