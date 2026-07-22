import { type Page, type Locator } from '@playwright/test'

/** 랭킹 페이지 POM. */
export class RankingPage {
  readonly page: Page
  readonly heading: Locator
  readonly tablist: Locator
  readonly usersTab: Locator
  readonly guildsTab: Locator
  readonly table: Locator
  readonly emptyState: Locator

  constructor(page: Page) {
    this.page = page
    this.heading = page.getByRole('heading', { level: 1, name: '랭킹' })
    this.tablist = page.getByRole('tablist', { name: '랭킹 종류' })
    this.usersTab = page.getByRole('tab', { name: '유저 랭킹' })
    this.guildsTab = page.getByRole('tab', { name: '서버 랭킹' })
    this.table = page.locator('table')
    // 빈 상태(EmptyState) — 대체 UI 감지용
    this.emptyState = page.getByText(/표시할 항목이 없습니다|랭킹에 오른/)
  }

  async goto(query = ''): Promise<void> {
    await this.page.goto(`/ranking${query}`)
    await this.page.waitForLoadState('networkidle')
  }
}
