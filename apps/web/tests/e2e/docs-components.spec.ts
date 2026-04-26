import { test, expect } from './fixtures'

test.describe('문서 — fumadocs 컴포넌트', () => {
  test.describe('Callout 컴포넌트', () => {
    test('창고 페이지에 warn 타입 Callout이 표시되어야 한다', async ({ page }) => {
      await page.goto('/docs/facilities/warehouse')
      await page.waitForLoadState('networkidle')
      await expect(page.getByText('창고 포화 주의')).toBeVisible()
    })

    test('창고 페이지에 success 타입 Callout이 표시되어야 한다', async ({ page }) => {
      await page.goto('/docs/facilities/warehouse')
      await page.waitForLoadState('networkidle')
      await expect(page.getByText('자재 보존')).toBeVisible()
    })

    test('공장 건설 페이지에 error 타입 Callout이 표시되어야 한다', async ({ page }) => {
      await page.goto('/docs/facilities/factories')
      await page.waitForLoadState('networkidle')
      await expect(page.getByText('선택 불가 변경')).toBeVisible()
    })

    test('게임 소개 페이지에 warn Callout이 표시되어야 한다', async ({ page }) => {
      await page.goto('/docs/getting-started/intro')
      await page.waitForLoadState('networkidle')
      await expect(page.getByText('창고 주의')).toBeVisible()
    })

    test('info 타입 Callout이 표시되어야 한다', async ({ page }) => {
      await page.goto('/docs/getting-started/how-to-start')
      await page.waitForLoadState('networkidle')
      await expect(page.getByText('핵심 루프')).toBeVisible()
    })
  })

  test.describe('Steps 컴포넌트', () => {
    test('시작하는 방법 페이지에 단계별 가이드가 표시되어야 한다', async ({ page }) => {
      await page.goto('/docs/getting-started/how-to-start')
      await page.waitForLoadState('networkidle')
      await expect(page.getByText('토지 확인')).toBeVisible()
      await expect(page.getByText('T1 공장 건설')).toBeVisible()
      await expect(page.getByText('자재 수확')).toBeVisible()
    })

    test('튜토리얼 퀘스트 페이지에 퀘스트 단계가 표시되어야 한다', async ({ page }) => {
      await page.goto('/docs/getting-started/tutorial-quests')
      await page.waitForLoadState('networkidle')
      // Steps 내부의 텍스트만 확인 (InlineTOC와 중복 방지)
      const article = page.locator('article')
      await expect(article.getByText('첫 번째 공장 건설').first()).toBeVisible()
      await expect(article.getByText('두 번째 공장 건설').first()).toBeVisible()
    })

    test('창고 페이지에 창고 꽉 찼을 때 단계가 표시되어야 한다', async ({ page }) => {
      await page.goto('/docs/facilities/warehouse')
      await page.waitForLoadState('networkidle')
      const article = page.locator('article')
      // Steps 내부 code 텍스트 확인
      await expect(article.getByText('/수확').first()).toBeVisible()
      await expect(article.getByText('/시장 판매').first()).toBeVisible()
    })
  })

  test.describe('Cards 컴포넌트', () => {
    test('문서 인덱스 페이지에 주요 카드들이 표시되어야 한다', async ({ page }) => {
      await page.goto('/docs')
      await page.waitForLoadState('networkidle')
      // 사이드바 링크와 중복될 수 있으므로 main content 영역으로 스코핑
      const content = page.locator('main article')
      await expect(content.getByRole('link', { name: /게임 소개/ }).first()).toBeVisible()
      await expect(content.getByRole('link', { name: /시작하는 방법/ }).first()).toBeVisible()
      await expect(content.getByRole('link', { name: /공장 건설/ }).first()).toBeVisible()
    })

    test('인덱스 카드 링크 클릭 시 해당 페이지로 이동해야 한다', async ({ page }) => {
      await page.goto('/docs')
      await page.waitForLoadState('networkidle')
      const content = page.locator('main article')
      await content
        .getByRole('link', { name: /시작하는 방법/ })
        .first()
        .click()
      await expect(page).toHaveURL('/docs/getting-started/how-to-start')
    })

    test('getting-started 페이지 하단 Cards가 표시되어야 한다', async ({ page }) => {
      await page.goto('/docs/getting-started/how-to-start')
      await page.waitForLoadState('networkidle')
      const content = page.locator('main article')
      await expect(content.getByRole('link', { name: /튜토리얼 퀘스트/ }).first()).toBeVisible()
    })
  })
})

test.describe('문서 — 검색', () => {
  test('검색 트리거 버튼이 사이드바에 표시되어야 한다', async ({ page }) => {
    const isMobile = (page.viewportSize()?.width ?? 1280) < 1024
    if (isMobile) {
      test.skip()
      return
    }
    await page.goto('/docs')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('button', { name: /검색/ })).toBeVisible()
  })

  test('⌘K 단축키로 검색 다이얼로그가 열려야 한다', async ({ page }) => {
    await page.goto('/docs')
    await page.waitForLoadState('networkidle')
    await page.keyboard.press('Meta+k')
    await expect(page.getByPlaceholder('문서 검색...')).toBeVisible()
  })

  test('검색어 "창고" 입력 시 결과가 반환되어야 한다', async ({ page }) => {
    await page.goto('/docs')
    await page.waitForLoadState('networkidle')
    await page.keyboard.press('Meta+k')
    await page.getByPlaceholder('문서 검색...').fill('창고')
    await page.waitForResponse((resp) => resp.url().includes('/api/search'))
    const results = page.locator('ul li a')
    await expect(results.first()).toBeVisible()
    expect(await results.count()).toBeGreaterThan(0)
  })

  test('ESC 키로 검색 다이얼로그가 닫혀야 한다', async ({ page }) => {
    await page.goto('/docs')
    await page.waitForLoadState('networkidle')
    await page.keyboard.press('Meta+k')
    await expect(page.getByPlaceholder('문서 검색...')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByPlaceholder('문서 검색...')).not.toBeVisible()
  })

  test('검색 결과 클릭 시 문서 페이지로 이동해야 한다', async ({ page }) => {
    await page.goto('/docs')
    await page.waitForLoadState('networkidle')
    await page.keyboard.press('Meta+k')
    // "공장 건설" 검색 — 결과가 /docs/facilities/factories 를 포함해야 함
    await page.getByPlaceholder('문서 검색...').fill('공장 건설')
    await page.waitForResponse((resp) => resp.url().includes('/api/search'))
    const firstResult = page.locator('ul li a').first()
    await expect(firstResult).toBeVisible()
    const href = await firstResult.getAttribute('href')
    expect(href).toMatch(/\/docs\//)
  })

  test('오버레이 클릭으로 검색 다이얼로그가 닫혀야 한다', async ({ page }) => {
    await page.goto('/docs')
    await page.waitForLoadState('networkidle')
    await page.keyboard.press('Meta+k')
    await expect(page.getByPlaceholder('문서 검색...')).toBeVisible()
    // 오버레이(배경) 클릭
    await page.locator('.bg-black\\/60').click()
    await expect(page.getByPlaceholder('문서 검색...')).not.toBeVisible()
  })
})
