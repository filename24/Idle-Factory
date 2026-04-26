import { test, expect } from './fixtures'
import { LoginPage } from '../pages/LoginPage'

// DISCORD_CLIENT_ID 미설정 시 /login은 500 에러 — env 구성 후 실행
const hasDiscordEnv = !!process.env.DISCORD_CLIENT_ID

test.describe('로그인 페이지', () => {
  let login: LoginPage

  test.beforeEach(async ({ page }) => {
    login = new LoginPage(page)
    await login.goto()
  })

  test('"Idle Factory" 제목이 표시되어야 한다', async () => {
    test.skip(!hasDiscordEnv, 'DISCORD_CLIENT_ID 환경변수 필요')
    await expect(login.heading).toBeVisible()
  })

  test('Discord 로그인 안내 문구가 표시되어야 한다', async () => {
    test.skip(!hasDiscordEnv, 'DISCORD_CLIENT_ID 환경변수 필요')
    await expect(login.description).toBeVisible()
  })

  test('"Discord로 로그인" 버튼이 표시되어야 한다', async () => {
    test.skip(!hasDiscordEnv, 'DISCORD_CLIENT_ID 환경변수 필요')
    await expect(login.loginButton).toBeVisible()
  })

  test('페이지 타이틀에 "Idle Factory"가 포함되어야 한다', async ({ page }) => {
    test.skip(!hasDiscordEnv, 'DISCORD_CLIENT_ID 환경변수 필요')
    await expect(page).toHaveTitle(/Idle Factory/)
  })

  test('직접 /login 접근 시 200 응답이어야 한다', async ({ page }) => {
    test.skip(!hasDiscordEnv, 'DISCORD_CLIENT_ID 환경변수 필요')
    const response = await page.goto('/login')
    expect(response?.status()).toBe(200)
  })
})
