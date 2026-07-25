import { type Page, type Locator } from '@playwright/test'

/** 서버별 통계 대시보드 POM. */
export class GuildDashboardPage {
  readonly page: Page
  readonly heading: Locator
  readonly notFound: Locator
  readonly dauSection: Locator
  readonly settlementSection: Locator

  constructor(page: Page) {
    this.page = page
    this.heading = page.getByRole('heading', { level: 1 })
    this.notFound = page.getByText('서버를 찾을 수 없습니다')
    this.dauSection = page.getByRole('heading', { name: '활동 추이' })
    this.settlementSection = page.getByRole('heading', { name: '주간 정산 히스토리' })
  }

  async goto(guildId: string): Promise<void> {
    await this.page.goto(`/dashboard/${guildId}`)
    await this.page.waitForLoadState('networkidle')
  }
}
