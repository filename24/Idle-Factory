import { test, expect } from './fixtures'
import ko from '../../messages/ko.json'
import en from '../../messages/en.json'

/**
 * 로케일 전환 e2e.
 *
 * 로케일은 URL 이 아니라 `NEXT_LOCALE` 쿠키로만 결정된다. 그래서 검증 포인트는
 * 세 가지다: 쿠키 없을 때의 기본값, 쿠키를 심었을 때의 반영, 그리고 전환 UI 가
 * 실제로 쿠키를 써서 다음 렌더를 바꾸는가.
 *
 * `<html lang>` 도 함께 본다 — 본문 언어와 어긋나면 스크린리더 발음과 브라우저
 * 번역 판단이 틀어지는데, 화면만 보면 눈치채기 어렵다.
 */
test.describe('로케일 전환', () => {
  test('쿠키가 없으면 한국어로 렌더한다', async ({ page }) => {
    await page.goto('/ranking')

    await expect(page.locator('html')).toHaveAttribute('lang', 'ko')
    await expect(page.locator('#ranking-heading')).toHaveText(ko.ranking.title)
  })

  test('NEXT_LOCALE=en 쿠키를 심으면 영어로 렌더한다', async ({ page, context }) => {
    await context.addCookies([{ name: 'NEXT_LOCALE', value: 'en', url: 'http://localhost:3000' }])

    await page.goto('/ranking')

    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page.locator('#ranking-heading')).toHaveText(en.ranking.title)
  })

  test('신뢰할 수 없는 쿠키 값은 기본 로케일로 막는다', async ({ page, context }) => {
    // 쿠키는 사용자가 임의로 바꿀 수 있고, 그 값이 messages/${locale}.json 경로에 들어간다.
    await context.addCookies([
      { name: 'NEXT_LOCALE', value: '../../etc/passwd', url: 'http://localhost:3000' },
    ])

    const response = await page.goto('/ranking')

    expect(response?.status()).toBe(200)
    await expect(page.locator('html')).toHaveAttribute('lang', 'ko')
    await expect(page.locator('#ranking-heading')).toHaveText(ko.ranking.title)
  })

  test('헤더 전환 UI 로 영어를 고르면 화면이 영어로 바뀐다', async ({ page }) => {
    await page.goto('/ranking')
    await page.waitForLoadState('networkidle')

    await page.locator('header').getByRole('button', { name: ko.locale.label }).click()
    await page.getByRole('menuitem', { name: 'English' }).click()

    await expect(page.locator('#ranking-heading')).toHaveText(en.ranking.title)
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  })

  test('전환한 로케일이 다른 페이지로 이동해도 유지된다', async ({ page }) => {
    await page.goto('/ranking')
    await page.waitForLoadState('networkidle')

    await page.locator('header').getByRole('button', { name: ko.locale.label }).click()
    await page.getByRole('menuitem', { name: 'English' }).click()
    await expect(page.locator('#ranking-heading')).toHaveText(en.ranking.title)

    await page.goto('/')

    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page.locator('header').getByRole('link', { name: en.nav.ranking })).toBeVisible()
  })
})
