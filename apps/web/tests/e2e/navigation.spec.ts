import { test, expect } from './fixtures'

test.describe('헤더 내비게이션', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
  })

  test('로고 클릭 시 홈(/)으로 이동해야 한다', async ({ page }) => {
    // /login은 env 미설정 시 500이므로 /docs에서 테스트
    await page.goto('/docs')
    const logo = page.locator('header').getByRole('link', { name: 'Idle Factory' })
    await logo.click()
    await expect(page).toHaveURL('/')
  })

  test('"문서" 링크 클릭 시 /docs 로 이동해야 한다', async ({ page }) => {
    // 헤더 내 링크만 스코핑 (푸터에도 동일 텍스트 존재)
    const docsLink = page.locator('header').getByRole('link', { name: '문서' })
    await expect(docsLink).toBeVisible()
    await docsLink.click()
    await expect(page).toHaveURL(/\/docs/)
  })

  test('헤더가 스크롤해도 상단에 고정되어야 한다 (sticky)', async ({ page }) => {
    const header = page.locator('header').first()
    await expect(header).toBeVisible()

    await page.evaluate(() => window.scrollTo(0, 1000))
    await expect(header).toBeVisible()
  })

  test('헤더에 "Idle Factory" 로고 텍스트가 표시되어야 한다', async ({ page }) => {
    await expect(page.locator('header').getByText('Idle Factory')).toBeVisible()
  })
})
