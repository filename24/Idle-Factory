/**
 * 신규 유저 온보딩 관통 테스트 (#21 최종 QA).
 *
 * 서비스 단위 테스트가 각 단계를 따로 검증하는 것과 달리, 이 스위트는 신규
 * 가입부터 튜토리얼 체인 완주까지를 **한 번에 이어서** 돌린다. 목적은 두 가지다.
 *
 *  1. 단계 간 상태 인계가 실제로 맞물리는지 — 건설비 차감 후 남은 잔액으로
 *     수확·판매가 가능한지, 판매 대금이 업그레이드 비용에 닿는지.
 *     체인은 **순차 해금**이다: 다음 퀘스트는 이전 퀘스트를 *수령* 해야 시드된다
 *     (`QuestService.claim` → `chain.next`). 따라서 행동 → 수령 → 다음 행동
 *     순서를 지켜야 하며, 이 순서가 곧 실제 유저 경험이다.
 *  2. **#21 결정 2 의 근거를 못박는다** — Q4 업그레이드(3,000원)는 퀘스트 보상만
 *     으로는 1,000원 부족하지만, Q3 완료 경로인 글로벌 즉시판매가 대금을 즉시
 *     지급하므로 40분(4 tick)이면 자력 조달된다. 검증기
 *     (`simulation/targets.ts`)가 이론값으로 주장하는 이 경로를 여기서 실제
 *     DB·서비스로 재현한다. 두 값이 갈리면 검증기가 거짓말을 하고 있는 것이다.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { buildCost, upgradeMoneyCost, TICK_MS } from '@idle/game-core'
import { runInTx } from '../../src/services/base'
import { FactoryService } from '../../src/services/factory'
import { HarvestService } from '../../src/services/harvest'
import { MarketSellService } from '../../src/services/marketSell'
import { QuestService } from '../../src/services/quest'
import { UserService } from '../../src/services/user'
import { closeDb, resetDb, testPrisma } from './setup'

const USER = '600000000000000001'
const GUILD = '610000000000000001'

/** 시드머니 (`UserService` STARTER_MONEY). */
const SEED_MONEY = 1_000n

/** 튜토리얼 Q1~Q3 보상 합계 (`quests/catalog.ts`). */
const Q1_TO_Q3_REWARDS = 1_000n + 500n + 500n

async function seedGuildAndPrices() {
  await testPrisma.guild.create({
    data: { id: GUILD, name: 'onboarding-guild', credit: 1000 }
  })
  // 글로벌 판매가 성립하려면 기준가 행이 있어야 한다 (시드 스크립트 대역).
  await testPrisma.globalMarketPrice.upsert({
    where: { material: 'GRAIN' },
    create: { material: 'GRAIN', basePrice: 10n, currentPrice: 10n },
    update: { currentPrice: 10n }
  })
}

/** 공장의 `lastHarvestAt` 을 tick 만큼 과거로 당겨 즉시 수확 가능하게 만든다. */
async function backdate(factoryId: string, ticks: number) {
  const factory = await testPrisma.factory.findUniqueOrThrow({
    where: { id: factoryId }
  })
  await testPrisma.factory.update({
    where: { id: factoryId },
    data: {
      lastHarvestAt: new Date(factory.lastHarvestAt.getTime() - ticks * TICK_MS)
    }
  })
}

/**
 * 실제 온보딩 진입점을 그대로 재현한다.
 *
 * `interaction-handlers/buttons/onboardingConsent.ts` 가 하는 일과 동일하다:
 * 유저 행 생성 → 약관 동의 stamp → 튜토리얼 체인 시드. 튜토리얼 퀘스트 행은
 * 유저 생성만으로는 만들어지지 않으므로(동의 플로우가 시드 책임을 갖는다)
 * 이 순서를 건너뛰면 Q1 이 애초에 존재하지 않는다.
 */
async function registerWithConsent(userId: string) {
  await runInTx(testPrisma, async (tx) => {
    await UserService.ensureWithinTx(tx, { discordId: userId })
    await QuestService.seedTutorial(tx, userId)
  })
}

async function moneyOf(userId: string): Promise<bigint> {
  const user = await testPrisma.user.findUniqueOrThrow({
    where: { id: userId }
  })
  return user.money
}

/** 퀘스트 상태를 읽는다. 행이 없으면 `null` (아직 해금 안 된 단계). */
async function statusOf(userId: string, questId: string) {
  const row = await testPrisma.userQuest.findUnique({
    where: { userId_questId: { userId, questId } },
    select: { status: true }
  })
  return row?.status ?? null
}

/**
 * 완료된 퀘스트를 수령한다 — 수령이 다음 단계를 해금하는 지점이다.
 *
 * `claim` 은 Tx 를 받는다 (보상 지급·체인 시드가 한 트랜잭션).
 */
async function claim(userId: string, questId: string) {
  expect(
    await statusOf(userId, questId),
    `${questId} 는 수령 전 COMPLETED 여야 한다`
  ).toBe('COMPLETED')
  return runInTx(testPrisma, (tx) => QuestService.claim(tx, userId, questId))
}

describe('신규 유저 온보딩 관통', () => {
  beforeEach(async () => {
    await resetDb()
    await seedGuildAndPrices()
  })

  afterAll(async () => {
    await closeDb()
  })

  it('가입 → 건설 → 수확 → 판매 → 업그레이드 → Q5 를 끝까지 통과한다', async () => {
    // ── 가입 (동의 플로우 = 튜토리얼 시드 지점) ──────────
    await registerWithConsent(USER)
    expect(await moneyOf(USER)).toBe(SEED_MONEY)

    // 체인 첫 단계가 진행 중이어야 이후 트리거가 물린다.
    const seeded = await testPrisma.userQuest.findFirstOrThrow({
      where: { userId: USER, questId: 'tutorial.1' }
    })
    expect(seeded.status).toBe('IN_PROGRESS')

    const land = await testPrisma.land.findFirstOrThrow({
      where: { userId: USER }
    })
    expect(land).toBeTruthy()

    // ── Q1: 첫 공장 건설 → 수령 → Q2 해금 ───────────────
    const built = await FactoryService.build(testPrisma, {
      userId: USER,
      type: 'FARM',
      anchorX: 0,
      anchorY: 0,
      guildId: GUILD
    })
    // 씨드 1,000 − 건설 1,000 = 0원. 여기서 막히면 온보딩이 성립하지 않는다.
    expect(await moneyOf(USER)).toBe(SEED_MONEY - buildCost('FARM'))
    expect(await statusOf(USER, 'tutorial.1')).toBe('COMPLETED')
    // 수령 전에는 다음 단계가 존재하지도 않는다.
    expect(await statusOf(USER, 'tutorial.2')).toBeNull()

    await claim(USER, 'tutorial.1')
    expect(await statusOf(USER, 'tutorial.2')).toBe('IN_PROGRESS')
    expect(await moneyOf(USER)).toBe(1_000n)

    // ── Q2: 수확 → 수령 → Q3 해금 ───────────────────────
    // 결정 2 가 상정하는 "부족분 조달" 구간. 4 tick = 40분.
    await backdate(built.factory.id, 4)
    const harvest = await HarvestService.harvestAll(testPrisma, USER)
    expect(harvest.factories.length).toBeGreaterThan(0)

    const stacks = await testPrisma.warehouseStack.findMany({
      where: { warehouse: { userId: USER }, material: 'GRAIN' }
    })
    // 농장 등급1 은 30개/tick → 4 tick = 120개.
    expect(stacks[0]!.count).toBe(120n)

    await claim(USER, 'tutorial.2')
    expect(await statusOf(USER, 'tutorial.3')).toBe('IN_PROGRESS')

    // ── Q3: 글로벌 즉시판매 (대금 즉시 지급) → 수령 ──────
    const sale = await MarketSellService.sellToGlobal(testPrisma, {
      userId: USER,
      material: 'GRAIN',
      quantity: 120n,
      guildId: GUILD
    })
    // 120개 × 10원 = 1,200원. 결정 2 의 "4 tick 이면 1,000원 부족분을 메운다"가
    // 이론이 아니라 실제로 성립하는지가 이 단정이다.
    expect(sale.unitPrice).toBe(10n)
    expect(sale.totalPaid).toBe(1_200n)
    expect(await statusOf(USER, 'tutorial.3')).toBe('COMPLETED')

    await claim(USER, 'tutorial.3')

    const cashBeforeUpgrade = await moneyOf(USER)
    // 씨드 1,000 − 건설 1,000 + 판매 1,200 + 보상 2,000 = 3,200원.
    expect(cashBeforeUpgrade).toBe(
      SEED_MONEY - buildCost('FARM') + 1_200n + Q1_TO_Q3_REWARDS
    )
    // 결정 2 의 핵심 주장: Q4 비용(3,000원)을 낼 수 있다.
    expect(cashBeforeUpgrade).toBeGreaterThanOrEqual(
      upgradeMoneyCost('FARM', 1)
    )

    // ── Q4: 업그레이드 → 수령 → Q5 해금 ────────────────
    expect(await statusOf(USER, 'tutorial.4')).toBe('IN_PROGRESS')
    // 업그레이드는 곡물 20개도 요구하므로 다시 수확해 재고를 만든다.
    await backdate(built.factory.id, 1)
    await HarvestService.harvestAll(testPrisma, USER)

    const upgraded = await FactoryService.upgrade(testPrisma, {
      userId: USER,
      factoryId: built.factory.id,
      guildId: GUILD
    })
    expect(upgraded.factory.grade).toBe(2)
    expect(await statusOf(USER, 'tutorial.4')).toBe('COMPLETED')

    await claim(USER, 'tutorial.4')
    expect(await statusOf(USER, 'tutorial.5')).toBe('IN_PROGRESS')

    // ── Q5: 두 번째 공장 → 수령 (체인 종착) ────────────
    await FactoryService.build(testPrisma, {
      userId: USER,
      type: 'FARM',
      anchorX: 1,
      anchorY: 0,
      guildId: GUILD
    })
    expect(await statusOf(USER, 'tutorial.5')).toBe('COMPLETED')
    await claim(USER, 'tutorial.5')

    // ── 완주 상태 확인 ─────────────────────────────────
    for (const id of [
      'tutorial.1',
      'tutorial.2',
      'tutorial.3',
      'tutorial.4',
      'tutorial.5'
    ]) {
      expect(await statusOf(USER, id), id).toBe('CLAIMED')
    }

    const user = await testPrisma.user.findUniqueOrThrow({
      where: { id: USER }
    })
    expect(user.level).toBeGreaterThanOrEqual(1)
    expect(await testPrisma.factory.count({ where: { userId: USER } })).toBe(2)
  })

  it('판매를 건너뛰면 Q4 업그레이드 비용에 닿지 않는다 (결정 2 의 전제)', async () => {
    // 이 단정이 깨지면 결정 2 의 근거("보상만으로는 부족하니 판매 경로가
    // 필요하다")가 사라지므로 검증식을 다시 봐야 한다.
    await registerWithConsent(USER)
    const built = await FactoryService.build(testPrisma, {
      userId: USER,
      type: 'FARM',
      anchorX: 0,
      anchorY: 0,
      guildId: GUILD
    })
    await claim(USER, 'tutorial.1')

    await backdate(built.factory.id, 1)
    await HarvestService.harvestAll(testPrisma, USER)
    await claim(USER, 'tutorial.2')

    // 씨드 1,000 − 건설 1,000 + Q1 1,000 + Q2 500 = 1,500원.
    const cash = await moneyOf(USER)
    expect(cash).toBe(SEED_MONEY - buildCost('FARM') + 1_000n + 500n)
    expect(cash).toBeLessThan(upgradeMoneyCost('FARM', 1))
  })
})
