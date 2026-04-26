import { test as base, expect, type Page, type TestInfo } from '@playwright/test'
export type { Page, TestInfo }
import * as fs from 'fs'
import * as path from 'path'

const SCREENSHOTS_BASE = path.join(__dirname, '../../test-results/screenshots')

export const test = base.extend<{ _autoScreenshot: void }>({
  _autoScreenshot: [
    async ({ page }, use, testInfo) => {
      await use()
      const device = testInfo.project.name === 'mobile-chrome' ? 'mobile' : 'desktop'
      const dir = path.join(SCREENSHOTS_BASE, device)
      fs.mkdirSync(dir, { recursive: true })
      const safeName = testInfo.title
        .replace(/[\s/\\:*?"<>|]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
      const screenshotPath = path.join(dir, `${safeName}.png`)
      await page.screenshot({ path: screenshotPath, fullPage: true })
      await testInfo.attach('screenshot', { path: screenshotPath, contentType: 'image/png' })
    },
    { auto: true },
  ],
})

export { expect }
