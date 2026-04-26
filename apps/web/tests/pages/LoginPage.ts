import { type Page, type Locator } from '@playwright/test'

/** 로그인 페이지 POM */
export class LoginPage {
  readonly page: Page
  readonly heading: Locator
  readonly description: Locator
  readonly loginButton: Locator

  constructor(page: Page) {
    this.page = page
    this.heading = page.getByRole('heading', { name: 'Idle Factory' })
    this.description = page.getByText('Discord 계정으로 로그인하여 공장을 관리하세요')
    this.loginButton = page.getByRole('button', { name: 'Discord로 로그인' })
  }

  async goto() {
    await this.page.goto('/login')
    await this.page.waitForLoadState('networkidle')
  }
}
