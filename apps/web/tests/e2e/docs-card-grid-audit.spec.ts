import { test, expect } from '@playwright/test'
import path from 'path'

const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots')

/**
 * Visual & computed-style audit for the fumadocs Cards component on /docs.
 *
 * Investigates whether `align-items: stretch` on the grid container is
 * causing individual cards to expand vertically beyond their content height.
 */
test.describe('docs /docs card grid layout audit', () => {
  test.use({ viewport: { width: 1920, height: 919 } })

  test('full-page screenshot at 1920x919', async ({ page }) => {
    await page.goto('/docs')
    await expect(page.locator('h1')).toBeVisible()

    // Let images / fonts settle
    await page.waitForLoadState('networkidle')

    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'docs-full-page-1920.png'),
      fullPage: true,
    })
  })

  test('card grid computed styles — columns, gap, align-items, height', async ({ page }) => {
    await page.goto('/docs')
    await expect(page.locator('h1')).toBeVisible()
    await page.waitForLoadState('networkidle')

    // --- grid container ---
    const gridContainer = page.locator('.docs-content div:has(> [data-card])').first()
    await expect(gridContainer).toBeVisible()

    const containerStyles = await gridContainer.evaluate((el) => {
      const cs = window.getComputedStyle(el)
      return {
        display: cs.display,
        gridTemplateColumns: cs.gridTemplateColumns,
        gap: cs.gap,
        rowGap: cs.rowGap,
        columnGap: cs.columnGap,
        alignItems: cs.alignItems,
        alignContent: cs.alignContent,
        height: cs.height,
        minHeight: cs.minHeight,
        boxSizing: cs.boxSizing,
      }
    })

    console.log('=== GRID CONTAINER COMPUTED STYLES ===')
    console.log(JSON.stringify(containerStyles, null, 2))

    // Must be a 3-column grid
    expect(containerStyles.display).toBe('grid')
    expect(containerStyles.gridTemplateColumns).toContain('px')
    const colWidths = containerStyles.gridTemplateColumns.split(' ')
    expect(colWidths).toHaveLength(3)

    // Flag stretch — this is the suspected root cause
    const isStretching = containerStyles.alignItems === 'stretch'
    console.log(`\nalign-items: ${containerStyles.alignItems} — stretching cards: ${isStretching}`)

    // --- individual cards ---
    const cards = page.locator('[data-card]')
    const cardCount = await cards.count()
    console.log(`\nCard count: ${cardCount}`)

    const cardStyleSamples: Record<string, string>[] = []
    for (let i = 0; i < cardCount; i++) {
      const styles = await cards.nth(i).evaluate((el) => {
        const cs = window.getComputedStyle(el)
        return {
          height: cs.height,
          minHeight: cs.minHeight,
          alignSelf: cs.alignSelf,
          padding: cs.padding,
          paddingTop: cs.paddingTop,
          paddingBottom: cs.paddingBottom,
          paddingLeft: cs.paddingLeft,
          paddingRight: cs.paddingRight,
          gridColumn: cs.gridColumn,
          display: cs.display,
          flexDirection: cs.flexDirection,
          justifyContent: cs.justifyContent,
        }
      })
      cardStyleSamples.push(styles)
    }

    console.log('\n=== CARD COMPUTED STYLES (all cards) ===')
    cardStyleSamples.forEach((s, i) => {
      console.log(
        `Card ${i + 1}: height=${s.height}  alignSelf=${s.alignSelf}  padding=${s.padding}`,
      )
    })

    // Detect abnormal stretching: cards taller than a threshold (compact cards
    // with ~2 lines of text + padding should be well under 120px at this viewport)
    const COMPACT_HEIGHT_THRESHOLD_PX = 120
    const stretchedCards = cardStyleSamples.filter((s) => {
      const h = parseFloat(s.height)
      return h > COMPACT_HEIGHT_THRESHOLD_PX
    })
    if (stretchedCards.length > 0) {
      console.log(
        `\nWARNING: ${stretchedCards.length}/${cardCount} cards exceed ${COMPACT_HEIGHT_THRESHOLD_PX}px height (possible stretch issue)`,
      )
      stretchedCards.forEach((s, i) => {
        console.log(`  Stretched card ${i + 1}: height=${s.height} alignSelf=${s.alignSelf}`)
      })
    } else {
      console.log(`\nAll cards are within compact height (<= ${COMPACT_HEIGHT_THRESHOLD_PX}px)`)
    }
  })

  test('close-up screenshot of the cards section', async ({ page }) => {
    await page.goto('/docs')
    await expect(page.locator('h1')).toBeVisible()
    await page.waitForLoadState('networkidle')

    const gridContainer = page.locator('.docs-content div:has(> [data-card])').first()
    await expect(gridContainer).toBeVisible()

    // Expand the bounding box slightly for context
    const box = await gridContainer.boundingBox()
    expect(box).not.toBeNull()

    const PADDING = 24
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'docs-cards-closeup.png'),
      clip: {
        x: Math.max(0, (box?.x ?? 0) - PADDING),
        y: Math.max(0, (box?.y ?? 0) - PADDING),
        width: (box?.width ?? 0) + PADDING * 2,
        height: (box?.height ?? 0) + PADDING * 2,
      },
    })

    console.log('Grid bounding box:', box)
  })

  test('Callout component alignment check', async ({ page }) => {
    await page.goto('/docs')
    await expect(page.locator('h1')).toBeVisible()
    await page.waitForLoadState('networkidle')

    // Fumadocs Callout is a div whose direct child has role="none" (the icon wrapper)
    const calloutContainer = page.locator('div:has(> [role="none"])').first()

    const calloutCount = await page.locator('div:has(> [role="none"])').count()
    console.log(`\nCallout components found: ${calloutCount}`)

    if (calloutCount > 0) {
      const calloutStyles = await calloutContainer.evaluate((el) => {
        const cs = window.getComputedStyle(el)
        return {
          display: cs.display,
          alignItems: cs.alignItems,
          gap: cs.gap,
        }
      })

      const iconEl = calloutContainer.locator('[role="none"]').first()
      const iconStyles = await iconEl.evaluate((el) => {
        const cs = window.getComputedStyle(el)
        return {
          alignSelf: cs.alignSelf,
          display: cs.display,
          height: cs.height,
          width: cs.width,
        }
      })

      console.log('Callout container styles:', calloutStyles)
      console.log('Callout icon styles:', iconStyles)

      // The CSS override sets align-items: center — verify it's applied
      expect(calloutStyles.alignItems).toBe('center')
    }
  })

  test('diagnose stretch root cause — grid vs card self-alignment', async ({ page }) => {
    await page.goto('/docs')
    await expect(page.locator('h1')).toBeVisible()
    await page.waitForLoadState('networkidle')

    const diagnosis = await page.evaluate(() => {
      const grid = document.querySelector(
        '.docs-content div:has(> [data-card])',
      ) as HTMLElement | null
      if (!grid) return { error: 'grid container not found' }

      const gridCs = window.getComputedStyle(grid)
      const cards = Array.from(grid.querySelectorAll('[data-card]')) as HTMLElement[]

      // Sample all card heights to detect if they are uniform (sign of stretch)
      const cardHeights = cards.map((c) => ({
        height: c.getBoundingClientRect().height,
        scrollHeight: c.scrollHeight,
        alignSelf: window.getComputedStyle(c).alignSelf,
        overflow: window.getComputedStyle(c).overflow,
      }))

      const heights = cardHeights.map((c) => c.height)
      const minH = Math.min(...heights)
      const maxH = Math.max(...heights)
      const allSameHeight = maxH - minH < 2 // within 2px

      return {
        gridAlignItems: gridCs.alignItems,
        gridAlignContent: gridCs.alignContent,
        cardCount: cards.length,
        cardHeights,
        heightRange: { min: minH, max: maxH },
        allSameHeight,
        verdict:
          allSameHeight && gridCs.alignItems === 'stretch'
            ? 'CONFIRMED: align-items:stretch is making all cards in each row equal height'
            : gridCs.alignItems === 'stretch'
              ? 'Grid has align-items:stretch but cards differ in height (rows may be stretching within themselves)'
              : 'No stretch detected — cards sized to content',
      }
    })

    console.log('\n=== STRETCH DIAGNOSIS ===')
    console.log(JSON.stringify(diagnosis, null, 2))
  })
})
