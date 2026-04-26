import { type Page, type Locator } from '@playwright/test'

/** 문서 페이지 POM */
export class DocsPage {
  readonly page: Page
  readonly sidebar: Locator
  readonly articleBody: Locator

  constructor(page: Page) {
    this.page = page
    this.sidebar = page.locator('nav').filter({ hasText: '시작하기' })
    this.articleBody = page.locator('article')
  }

  async goto(slug?: string) {
    await this.page.goto(slug ? `/docs/${slug}` : '/docs')
    await this.page.waitForLoadState('networkidle')
  }
}
