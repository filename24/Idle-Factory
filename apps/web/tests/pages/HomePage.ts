import { type Page, type Locator } from '@playwright/test'

/** 홈 랜딩 페이지 POM */
export class HomePage {
  readonly page: Page
  readonly heading: Locator
  readonly subheading: Locator
  readonly startButton: Locator
  readonly guideButton: Locator
  readonly factoryShowcaseHeading: Locator
  readonly economySectionHeading: Locator
  readonly ctaSection: Locator

  constructor(page: Page) {
    this.page = page
    this.heading = page.getByRole('heading', { level: 1 })
    this.subheading = page.getByText('Discord 서버 안에서 공장을 건설하고')
    this.startButton = page.getByRole('link', { name: 'Discord로 시작하기' }).first()
    this.guideButton = page.getByRole('link', { name: '게임 가이드' }).first()
    this.factoryShowcaseHeading = page.getByText('11가지 공장, 3단계 티어')
    this.economySectionHeading = page.getByRole('heading', { name: '살아있는 경제 시스템' })
    this.ctaSection = page.getByRole('heading', { name: '지금 바로' })
  }

  async goto() {
    await this.page.goto('/')
    await this.page.waitForLoadState('networkidle')
  }
}
