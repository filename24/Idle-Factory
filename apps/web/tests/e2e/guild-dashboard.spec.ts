import { test, expect } from './fixtures'
import { GuildDashboardPage } from '../pages/GuildDashboardPage'

test.describe('서버별 통계 대시보드', () => {
  test('존재하지 않는 서버 ID는 404 안내를 보여준다', async ({ page }) => {
    const guild = new GuildDashboardPage(page)
    const res = await page.goto('/dashboard/999999999999999999')
    expect(res?.status()).toBe(404)
    await expect(guild.notFound).toBeVisible()
  })

  test('형식이 잘못된 서버 ID(비숫자)는 404 안내를 보여준다', async ({ page }) => {
    const guild = new GuildDashboardPage(page)
    await page.goto('/dashboard/not-a-snowflake')
    await expect(guild.notFound).toBeVisible()
  })

  // 아래 두 테스트는 실제 서버 데이터에 의존한다. 공유 dev DB는 다른 프로세스가
  // 언제든 초기화할 수 있어(레이스), 데이터가 없거나 조회 도중 사라지면 하드 실패
  // 대신 스킵한다. 링크는 페이지가 실제 렌더한 것(self-consistent)을 사용한다.
  test('서버 랭킹에 표시된 서버명 링크로 대시보드에 진입해 통계를 렌더한다', async ({ page }) => {
    await page.goto('/ranking?scope=guilds')
    await page.waitForLoadState('networkidle')

    const guildLinks = page.locator('table a[href^="/dashboard/"]')
    const count = await guildLinks.count()
    test.skip(count === 0, '랭킹에 표시된 서버가 없어 스킵(공유 DB)')

    const href = await guildLinks.first().getAttribute('href')
    expect(href).toBeTruthy()
    await guildLinks.first().click()
    await expect(page).toHaveURL(new RegExp(href!.replace(/\//g, '\\/')))

    const guild = new GuildDashboardPage(page)
    // 클릭 후 서버가 사라졌으면(레이스) notFound — 그 경우 스킵.
    if (await guild.notFound.isVisible().catch(() => false)) {
      test.skip(true, '진입 시점에 서버 데이터가 사라짐(공유 DB 레이스)')
    }
    await expect(guild.heading).toBeVisible()
    await expect(page.getByText('금고 잔액')).toBeVisible()
    await expect(guild.dauSection).toBeVisible()
    await expect(guild.settlementSection).toBeVisible()
  })
})
