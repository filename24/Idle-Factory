import { test, expect } from './fixtures'
import { DocsPage } from '../pages/DocsPage'

test.describe('문서 페이지', () => {
  let docs: DocsPage

  test.beforeEach(async ({ page }) => {
    docs = new DocsPage(page)
    await docs.goto()
  })

  test('/docs 접근 시 200 응답이어야 한다', async ({ page }) => {
    const response = await page.goto('/docs')
    expect(response?.status()).toBe(200)
  })

  test('문서 사이드바가 표시되어야 한다', async ({ page }) => {
    // 모바일에서는 Fumadocs가 사이드바를 숨김
    const isMobile = page.viewportSize()?.width !== undefined && page.viewportSize()!.width < 768
    if (isMobile) {
      test.skip()
      return
    }
    await expect(docs.sidebar).toBeVisible()
  })

  test('사이드바에 "게임 소개" 링크가 있어야 한다', async ({ page }) => {
    // "시작하기"는 Fumadocs 카테고리 헤더(링크 아님) — 하위 페이지 링크로 확인
    const isMobile = page.viewportSize()?.width !== undefined && page.viewportSize()!.width < 768
    if (isMobile) {
      test.skip()
      return
    }
    await expect(docs.sidebar.getByRole('link', { name: '게임 소개' }).first()).toBeVisible()
  })

  test('/docs/getting-started/intro 페이지가 로드되어야 한다', async ({ page }) => {
    await docs.goto('getting-started/intro')
    await expect(docs.articleBody).toBeVisible()
  })

  test('/docs/facilities/factories 페이지가 로드되어야 한다', async ({ page }) => {
    await docs.goto('facilities/factories')
    await expect(docs.articleBody).toBeVisible()
  })

  test('존재하지 않는 문서 경로는 404를 반환해야 한다', async ({ page }) => {
    const response = await page.goto('/docs/nonexistent-page-xyz')
    expect(response?.status()).toBe(404)
  })
})
