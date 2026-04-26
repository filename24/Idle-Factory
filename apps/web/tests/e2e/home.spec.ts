import { test, expect } from './fixtures'
import { HomePage } from '../pages/HomePage'

test.describe('홈 페이지', () => {
  let home: HomePage

  test.beforeEach(async ({ page }) => {
    home = new HomePage(page)
    await home.goto()
  })

  test('히어로 섹션 — h1 제목이 보여야 한다', async () => {
    await expect(home.heading).toContainText('산업 제국')
  })

  test('히어로 섹션 — 서브 설명 문구가 보여야 한다', async () => {
    await expect(home.subheading).toBeVisible()
  })

  test('히어로 섹션 — CTA "Discord로 시작하기" 버튼이 /login 으로 연결되어야 한다', async ({
    page,
  }) => {
    await expect(home.startButton).toBeVisible()
    await home.startButton.click()
    await expect(page).toHaveURL('/login')
  })

  test('히어로 섹션 — "게임 가이드" 버튼이 /docs 로 연결되어야 한다', async ({ page }) => {
    await expect(home.guideButton).toBeVisible()
    await home.guideButton.click()
    await expect(page).toHaveURL(/\/docs/)
  })

  test('공장 쇼케이스 섹션 — "11가지 공장, 3단계 티어" 문구가 보여야 한다', async () => {
    await expect(home.factoryShowcaseHeading).toBeVisible()
  })

  test('경제 섹션 — "살아있는 경제 시스템" 제목이 보여야 한다', async () => {
    await expect(home.economySectionHeading).toBeVisible()
  })

  test('하단 CTA 섹션 — "지금 바로" 제목이 보여야 한다', async () => {
    await expect(home.ctaSection).toBeVisible()
  })

  test('하단 CTA 섹션 — "Discord로 시작하기" 링크가 /login 으로 이어져야 한다', async ({
    page,
  }) => {
    const ctaStart = page.getByRole('link', { name: /Discord로 시작하기/ }).last()
    await expect(ctaStart).toBeVisible()
    await ctaStart.click()
    await expect(page).toHaveURL('/login')
  })

  test('하단 CTA 섹션 — "게임 가이드 읽기" 링크가 /docs 로 이어져야 한다', async ({ page }) => {
    const ctaGuide = page.getByRole('link', { name: '게임 가이드 읽기' })
    await expect(ctaGuide).toBeVisible()
    await ctaGuide.click()
    await expect(page).toHaveURL(/\/docs/)
  })
})
