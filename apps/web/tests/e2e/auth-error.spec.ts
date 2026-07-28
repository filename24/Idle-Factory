import { test, expect } from './fixtures'
import { AUTH_ERROR_CATALOG, UNKNOWN_AUTH_ERROR_CODE } from '../../src/lib/auth-errors'

const heading = '#auth-error-heading'

test.describe('인증 실패 안내 페이지', () => {
  test('error 파라미터 없이 접근해도 폴백 안내를 렌더한다', async ({ page }) => {
    const response = await page.goto('/auth/error')
    expect(response?.status()).toBe(200)
    await expect(page.locator(heading)).toHaveText(
      AUTH_ERROR_CATALOG[UNKNOWN_AUTH_ERROR_CODE].title,
    )
  })

  test('사용자 취소(access_denied)를 재시도 가능한 안내로 보여준다', async ({ page }) => {
    await page.goto('/auth/error?error=access_denied')
    await expect(page.locator(heading)).toHaveText(AUTH_ERROR_CATALOG.access_denied.title)
    await expect(page.getByRole('link', { name: '다시 로그인' })).toBeVisible()
  })

  test('설정 오류(invalid_client)에는 재시도 대신 문의를 안내한다', async ({ page }) => {
    // 2026-07-28 프로덕션 장애 코드. 사용자가 재시도해도 절대 풀리지 않는다.
    await page.goto('/auth/error?error=invalid_client')
    await expect(page.locator(heading)).toHaveText(AUTH_ERROR_CATALOG.invalid_client.title)
    await expect(page.getByRole('link', { name: 'Discord 서버에서 문의' })).toBeVisible()
    await expect(page.getByRole('link', { name: '다시 로그인' })).toHaveCount(0)
  })

  test('알 수 없는 코드도 폴백 안내와 함께 원본 코드를 노출한다', async ({ page }) => {
    await page.goto('/auth/error?error=totally_made_up_code')
    await expect(page.locator(heading)).toHaveText(
      AUTH_ERROR_CATALOG[UNKNOWN_AUTH_ERROR_CODE].title,
    )
    await expect(page.getByText('totally_made_up_code')).toBeVisible()
  })

  test('재시도 링크가 원래 목적지를 이어받는다', async ({ page }) => {
    await page.goto('/auth/error?error=state_mismatch&callbackUrl=%2Fdashboard%2Fme')
    await expect(page.getByRole('link', { name: '다시 로그인' })).toHaveAttribute(
      'href',
      '/login?callbackUrl=%2Fdashboard%2Fme',
    )
  })

  test('외부 callbackUrl 은 오픈 리다이렉트로 이어지지 않는다', async ({ page }) => {
    await page.goto('/auth/error?error=state_mismatch&callbackUrl=https%3A%2F%2Fevil.example')
    await expect(page.getByRole('link', { name: '다시 로그인' })).toHaveAttribute(
      'href',
      '/login?callbackUrl=%2Fdashboard',
    )
  })

  test('마크업이 섞인 error 값을 그대로 렌더하지 않는다', async ({ page }) => {
    await page.goto('/auth/error?error=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E')
    await expect(page.locator('#auth-error-heading')).toBeVisible()
    await expect(page.locator('img[onerror]')).toHaveCount(0)
  })

  test('홈으로 돌아가기 링크는 항상 있다', async ({ page }) => {
    await page.goto('/auth/error?error=banned')
    await expect(page.getByRole('link', { name: '홈으로 돌아가기' })).toHaveAttribute('href', '/')
  })
})
