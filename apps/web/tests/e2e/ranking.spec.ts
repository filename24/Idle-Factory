import { test, expect } from './fixtures'
import { RankingPage } from '../pages/RankingPage'

test.describe('랭킹 페이지', () => {
  let ranking: RankingPage

  test.beforeEach(async ({ page }) => {
    ranking = new RankingPage(page)
    await ranking.goto()
  })

  test('h1 "랭킹" 제목과 탭 목록이 보여야 한다', async () => {
    await expect(ranking.heading).toBeVisible()
    await expect(ranking.tablist).toBeVisible()
    await expect(ranking.usersTab).toBeVisible()
    await expect(ranking.guildsTab).toBeVisible()
  })

  test('기본 진입 시 유저 탭이 선택되어 있어야 한다', async () => {
    await expect(ranking.usersTab).toHaveAttribute('aria-selected', 'true')
    await expect(ranking.guildsTab).toHaveAttribute('aria-selected', 'false')
  })

  test('서버 탭 클릭 시 scope=guilds 로 이동하고 선택 상태가 바뀐다', async ({ page }) => {
    await ranking.guildsTab.click()
    await expect(page).toHaveURL(/scope=guilds/)
    await expect(ranking.guildsTab).toHaveAttribute('aria-selected', 'true')
  })

  test('유저 탭 — 테이블 또는 빈 상태 중 하나가 반드시 보여야 한다', async ({ page }) => {
    const tableOrEmpty = page.locator('table, [class*="border-dashed"]')
    await expect(tableOrEmpty.first()).toBeVisible()
  })

  test('정렬 토글(레벨)이 URL sort 파라미터를 바꾼다', async ({ page }) => {
    const levelSort = page.getByRole('link', { name: '레벨' })
    await expect(levelSort).toBeVisible()
    await levelSort.click()
    await expect(page).toHaveURL(/sort=level/)
  })

  test('잘못된 page 파라미터(?page=abc)에도 크래시 없이 렌더된다', async ({ page }) => {
    const res = await page.goto('/ranking?page=abc')
    expect(res?.status()).toBe(200)
    await expect(ranking.heading).toBeVisible()
  })

  test('범위를 벗어난 페이지(?page=99999)는 안내 문구를 보여준다', async ({ page }) => {
    await page.goto('/ranking?scope=users&sort=money&page=99999')
    await expect(page.getByText('이 페이지에는 표시할 항목이 없습니다.')).toBeVisible()
    await expect(page.getByRole('link', { name: '첫 페이지로 이동' })).toBeVisible()
  })

  test('공유 URL(?scope=guilds&sort=weeklyDAU)로 직접 진입해도 상태가 복원된다', async ({
    page,
  }) => {
    await page.goto('/ranking?scope=guilds&sort=weeklyDAU')
    await expect(ranking.guildsTab).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('link', { name: '주간 활동' })).toHaveAttribute(
      'aria-current',
      'true',
    )
  })
})
