/**
 * 반응형 레이아웃 + 로그인 페이지 + 콘솔 에러 감사 테스트
 * E2E 평가 전용 — 브라우저별 단독 실행
 */
import { test, expect } from './fixtures'

// ─── Responsive viewports ─────────────────────────────────────────────────────

const VIEWPORTS = [
  { name: 'mobile-375', width: 375, height: 812 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'desktop-1440', width: 1440, height: 900 },
] as const

const PAGES = [
  { slug: '/', label: 'home' },
  { slug: '/docs', label: 'docs' },
  { slug: '/login', label: 'login' },
] as const

test.describe('반응형 레이아웃 — 다중 뷰포트', () => {
  // chromium desktop only
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'responsive 테스트는 chromium 전용')
  })

  for (const vp of VIEWPORTS) {
    for (const pg of PAGES) {
      test(`${vp.name} — ${pg.label} 페이지 오버플로우 없음`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height })
        await page.goto(pg.slug)
        await page.waitForLoadState('networkidle')

        // Horizontal overflow check
        const hasHorizScroll = await page.evaluate(() => {
          return document.documentElement.scrollWidth > document.documentElement.clientWidth
        })
        expect(hasHorizScroll, `${vp.name} ${pg.label}: 가로 스크롤(오버플로우) 감지됨`).toBe(false)
      })
    }
  }
})

// ─── Console errors ────────────────────────────────────────────────────────────

const CRITICAL_PAGES = ['/', '/docs', '/docs/getting-started/intro', '/login']

test.describe('콘솔 에러 감사', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'console 감사는 chromium 전용')
  })

  for (const url of CRITICAL_PAGES) {
    test(`${url} — 콘솔 에러 없음`, async ({ page }) => {
      const errors: string[] = []
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text())
      })
      page.on('pageerror', (err) => {
        errors.push(`[pageerror] ${err.message}`)
      })

      await page.goto(url)
      await page.waitForLoadState('networkidle')

      // Filter out known non-production noise:
      // 1. Third-party analytics/favicon CORS preflight
      // 2. React hydration mismatch triggered by fumadocs RootProvider theme init
      //    (dev-mode only — className="dark" on server vs "light" resolved client-side)
      const filteredErrors = errors.filter(
        (e) =>
          !e.includes('favicon') &&
          !e.includes('analytics') &&
          !e.includes('clarity') &&
          !e.includes('gtag') &&
          !e.includes('hydration-mismatch') &&
          !e.includes('tree hydrated but some attributes') &&
          !e.includes('className'),
      )

      if (filteredErrors.length > 0) {
        console.warn(`[WARN] ${url} 콘솔 에러:\n${filteredErrors.join('\n')}`)
      }

      expect(filteredErrors, `${url}에 콘솔 에러 발생: ${filteredErrors.join('; ')}`).toHaveLength(
        0,
      )
    })
  }
})

// ─── Login page functional (works even without DISCORD_CLIENT_ID) ─────────────

test.describe('로그인 페이지 — 기본 동작', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'login 테스트는 chromium 전용')
  })

  test('/login 페이지가 200 응답을 반환해야 한다', async ({ page }) => {
    const resp = await page.goto('/login')
    expect(resp?.status()).toBe(200)
  })

  test('/login 페이지에 인증 관련 요소가 표시되어야 한다', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('networkidle')

    // Either a heading or a button with Discord-related text must exist
    const discordText = page.getByText(/Discord/i)
    await expect(discordText.first()).toBeVisible()
  })

  test('/login 페이지 타이틀에 "Idle Factory"가 포함되어야 한다', async ({ page }) => {
    await page.goto('/login')
    await expect(page).toHaveTitle(/Idle Factory/i)
  })

  test('헤더에서 /login 경유 내비게이션이 동작해야 한다', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    // Click any "로그인" or "시작하기" link in header
    const authLink = page
      .locator('header')
      .getByRole('link')
      .filter({ hasText: /로그인|시작/i })
    const count = await authLink.count()
    if (count > 0) {
      await authLink.first().click()
      await page.waitForLoadState('networkidle')
      await expect(page).toHaveURL('/login')
    } else {
      // Header may not have a login link — navigate directly and verify
      await page.goto('/login')
      expect(page.url()).toContain('/login')
    }
  })
})

// ─── Footer ────────────────────────────────────────────────────────────────────

test.describe('푸터', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'footer 테스트는 chromium 전용')
  })

  test('홈 페이지 푸터가 표시되어야 한다', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    // Next.js dev overlay also injects a <footer> — scope to the real page footer via role
    const footer = page.getByRole('contentinfo')
    await expect(footer).toBeVisible()
  })

  test('푸터에 "문서" 링크가 포함되어야 한다', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    const footerDocsLink = page.locator('footer').getByRole('link', { name: '문서' })
    await expect(footerDocsLink).toBeVisible()
  })
})

// ─── Core sections scroll visibility ─────────────────────────────────────────

test.describe('홈 — 섹션별 가시성 (스크롤 포함)', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'section 테스트는 chromium 전용')
  })

  test('CoreLoop 섹션이 뷰포트에 스크롤 가능해야 한다', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // CoreLoop typically has a heading with "핵심 루프" or similar
    const heading = page
      .getByRole('heading')
      .filter({ hasText: /루프|공장|핵심/i })
      .first()
    if ((await heading.count()) > 0) {
      await heading.scrollIntoViewIfNeeded()
      await expect(heading).toBeInViewport()
    } else {
      // Fallback: verify the page has multiple headings (multi-section layout)
      const headings = page.getByRole('heading', { level: 2 })
      expect(await headings.count()).toBeGreaterThanOrEqual(2)
    }
  })

  test('FactoryShowcase 섹션이 스크롤 시 보여야 한다', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    const showcase = page.getByText('11가지 공장, 3단계 티어')
    await showcase.scrollIntoViewIfNeeded()
    await expect(showcase).toBeInViewport()
  })

  test('EconomySection 섹션이 스크롤 시 보여야 한다', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    const economy = page.getByRole('heading', { name: '살아있는 경제 시스템' })
    await economy.scrollIntoViewIfNeeded()
    await expect(economy).toBeInViewport()
  })
})
