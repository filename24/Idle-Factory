import { test } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'

const OUT = path.join(__dirname, '../../test-results/ui-audit')

function capture(label: string) {
  return async (page: import('@playwright/test').Page) => {
    fs.mkdirSync(OUT, { recursive: true })
    await page.screenshot({ path: path.join(OUT, `${label}.png`), fullPage: true })
  }
}

const PAGES = [
  { url: '/', label: 'home' },
  { url: '/login', label: 'login' },
  { url: '/docs', label: 'docs-index' },
  { url: '/docs/getting-started/intro', label: 'docs-intro' },
  { url: '/docs/getting-started/how-to-start', label: 'docs-how-to-start' },
  { url: '/docs/getting-started/tutorial-quests', label: 'docs-tutorial' },
  { url: '/docs/facilities/factories', label: 'docs-factories' },
  { url: '/docs/facilities/warehouse', label: 'docs-warehouse' },
  { url: '/docs/facilities/land-slots', label: 'docs-land-slots' },
  { url: '/docs/economy/market', label: 'docs-market' },
  { url: '/docs/economy/materials-trading', label: 'docs-trading' },
  { url: '/docs/economy/stock-market', label: 'docs-stock' },
  { url: '/docs/advanced/level-growth', label: 'docs-level' },
  { url: '/docs/advanced/server-guild', label: 'docs-guild' },
  { url: '/terms', label: 'terms' },
]

const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'desktop', width: 1440, height: 900 },
]

for (const vp of VIEWPORTS) {
  test.describe(`[${vp.name}]`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } })

    for (const pg of PAGES) {
      test(`${pg.label}`, async ({ page }) => {
        await page.goto(pg.url)
        await page.waitForLoadState('networkidle')
        await capture(`${vp.name}__${pg.label}`)(page)
      })
    }

    test(`home-dark`, async ({ page }) => {
      await page.goto('/')
      await page.waitForLoadState('networkidle')
      await page.evaluate(() => document.documentElement.classList.add('dark'))
      await page.waitForTimeout(300)
      await capture(`${vp.name}__home-dark`)(page)
    })
  })
}
