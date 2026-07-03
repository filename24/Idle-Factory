/**
 * `MarketPriceService` 통합 테스트 (전용 idle_i15-dev DB).
 *
 * 검증 축 (docs/design/06-market.md §가격 산출 공식, GitHub #15):
 *  - priceTick: currentPrice 재계산(결정적 noise 주입) · clamp · EMA 갱신 ·
 *    recentSales 윈도 리셋 · windowStartedAt 갱신 — 단일 tick 의 원자성
 *  - listPrices: 기준가 대비 등락(1만분율) 계산
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import type { MaterialType } from '@idle/game-core'
import { MarketPriceService } from '../../src/services/marketPrice'
import { closeDb, resetDb, testPrisma } from './setup'

async function seedPrice(
  material: MaterialType,
  basePrice: bigint,
  opts?: {
    currentPrice?: bigint
    recentSales?: number
    avgSales?: number
  }
) {
  await testPrisma.globalMarketPrice.create({
    data: {
      material,
      basePrice,
      currentPrice: opts?.currentPrice ?? basePrice,
      recentSales: opts?.recentSales ?? 0,
      avgSales: opts?.avgSales ?? 0
    }
  })
}

describe('MarketPriceService.priceTick', () => {
  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await closeDb()
  })

  it('가격 행이 없으면 0건 (시드 전 안전)', async () => {
    const result = await MarketPriceService.priceTick(testPrisma, {
      noiseFor: () => 0
    })
    expect(result.updatedCount).toBe(0)
  })

  it('noise=0 · 수요 변화 없음이면 기준가로 수렴하고 윈도를 리셋한다', async () => {
    await seedPrice('GRAIN', 10n, { currentPrice: 14n })
    const now = new Date('2026-07-03T12:00:00Z')

    const result = await MarketPriceService.priceTick(testPrisma, {
      noiseFor: () => 0,
      now
    })

    expect(result.updatedCount).toBe(1)
    const row = await testPrisma.globalMarketPrice.findUniqueOrThrow({
      where: { material: 'GRAIN' }
    })
    // basePrice 기준 재계산 — 직전 currentPrice(14) 는 앵커가 아니다.
    expect(row.currentPrice).toBe(10n)
    expect(row.recentSales).toBe(0)
    expect(row.windowStartedAt.getTime()).toBe(now.getTime())
  })

  it('노이즈가 가격에 반영된다 (자재별 주입)', async () => {
    await seedPrice('GRAIN', 100n)
    await seedPrice('ORE', 100n)

    await MarketPriceService.priceTick(testPrisma, {
      noiseFor: (m) => (m === 'GRAIN' ? 0.1 : -0.1)
    })

    const grain = await testPrisma.globalMarketPrice.findUniqueOrThrow({
      where: { material: 'GRAIN' }
    })
    const ore = await testPrisma.globalMarketPrice.findUniqueOrThrow({
      where: { material: 'ORE' }
    })
    expect(grain.currentPrice).toBe(110n)
    expect(ore.currentPrice).toBe(90n)
  })

  it('수요 급증은 상한(기준가 ×2)에서 clamp 된다', async () => {
    await seedPrice('STEEL', 50n, { recentSales: 100_000, avgSales: 1 })

    await MarketPriceService.priceTick(testPrisma, {
      noiseFor: () => 0.2
    })

    const row = await testPrisma.globalMarketPrice.findUniqueOrThrow({
      where: { material: 'STEEL' }
    })
    expect(row.currentPrice).toBe(100n)
  })

  it('EMA 는 ema×0.9 + recent×0.1 로 갱신되고 다음 tick 의 수요 기준선이 된다', async () => {
    await seedPrice('WOOD', 100n, { recentSales: 100, avgSales: 0 })

    // tick 1: avgSales=0 → demandFactor 0 (U-5 가드) → 가격 = 기준가.
    await MarketPriceService.priceTick(testPrisma, { noiseFor: () => 0 })
    let row = await testPrisma.globalMarketPrice.findUniqueOrThrow({
      where: { material: 'WOOD' }
    })
    expect(row.currentPrice).toBe(100n)
    expect(row.avgSales).toBeCloseTo(10, 10) // 0×0.9 + 100×0.1
    expect(row.recentSales).toBe(0)

    // 윈도 거래량 20 적재 후 tick 2: demand = (20-10)/10×0.1 = +10%.
    await testPrisma.globalMarketPrice.update({
      where: { material: 'WOOD' },
      data: { recentSales: 20 }
    })
    await MarketPriceService.priceTick(testPrisma, { noiseFor: () => 0 })
    row = await testPrisma.globalMarketPrice.findUniqueOrThrow({
      where: { material: 'WOOD' }
    })
    expect(row.currentPrice).toBe(110n)
    expect(row.avgSales).toBeCloseTo(11, 10) // 10×0.9 + 20×0.1
    expect(row.recentSales).toBe(0)
  })

  it('거래가 없으면 EMA 가 감쇠한다 (하락 수요 반영)', async () => {
    await seedPrice('FUEL', 80n, { recentSales: 0, avgSales: 100 })

    await MarketPriceService.priceTick(testPrisma, { noiseFor: () => 0 })

    const row = await testPrisma.globalMarketPrice.findUniqueOrThrow({
      where: { material: 'FUEL' }
    })
    // demand = (0-100)/100 × 0.1 = -10% → 80 × 0.9 = 72
    expect(row.currentPrice).toBe(72n)
    expect(row.avgSales).toBeCloseTo(90, 10)
  })
})

describe('MarketPriceService.listPrices', () => {
  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await closeDb()
  })

  it('기준가 대비 등락을 1만분율 정수로 계산한다', async () => {
    await seedPrice('GRAIN', 10n, { currentPrice: 12n })
    await seedPrice('ORE', 20n, { currentPrice: 14n })
    await seedPrice('CAR', 500n, { currentPrice: 500n })

    const views = await MarketPriceService.listPrices(testPrisma)
    const byMaterial = new Map(views.map((v) => [v.material, v]))

    expect(views).toHaveLength(3)
    expect(byMaterial.get('GRAIN')?.changeFromBasePpm).toBe(2_000n) // +20%
    expect(byMaterial.get('ORE')?.changeFromBasePpm).toBe(-3_000n) // -30%
    expect(byMaterial.get('CAR')?.changeFromBasePpm).toBe(0n)
  })
})
