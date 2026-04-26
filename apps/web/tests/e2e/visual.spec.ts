import { test, type Page, type TestInfo } from './fixtures'
import * as fs from 'fs'
import * as path from 'path'

const SCREENSHOTS_BASE = path.join(__dirname, '../../test-results/screenshots')

function deviceFolder(testInfo: TestInfo) {
  return testInfo.project.name === 'mobile-chrome' ? 'mobile' : 'desktop'
}

function makeCapture(testInfo: TestInfo) {
  const dir = path.join(SCREENSHOTS_BASE, deviceFolder(testInfo))
  fs.mkdirSync(dir, { recursive: true })
  return async (page: Page, name: string) => {
    await page.screenshot({
      path: path.join(dir, `${name}.png`),
      fullPage: true,
    })
  }
}

async function enableDark(page: Page) {
  await page.evaluate(() => document.documentElement.classList.add('dark'))
}

test.describe('시각적 스크린샷 — 홈', () => {
  test('홈 라이트', async ({ page }, testInfo) => {
    const capture = makeCapture(testInfo)
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await capture(page, 'home-light')
  })

  test('홈 다크', async ({ page }, testInfo) => {
    const capture = makeCapture(testInfo)
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await enableDark(page)
    await capture(page, 'home-dark')
  })
})

test.describe('시각적 스크린샷 — 문서', () => {
  test('문서 라이트', async ({ page }, testInfo) => {
    const capture = makeCapture(testInfo)
    await page.goto('/docs')
    await page.waitForLoadState('networkidle')
    await capture(page, 'docs-light')
  })

  test('문서 다크', async ({ page }, testInfo) => {
    const capture = makeCapture(testInfo)
    await page.goto('/docs')
    await page.waitForLoadState('networkidle')
    await enableDark(page)
    await capture(page, 'docs-dark')
  })
})
