import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import {
  creditXpBonusBps,
  effectiveMaxGrade,
  upgradeMoneyCost,
  xpForEvent
} from '@idle/game-core'
import { FactoryService } from '../../src/services/factory'
import { ServiceError } from '../../src/services/base'
import { createLandWithSlots } from '../../src/services/user'
import { closeDb, resetDb, testPrisma } from './setup'

/**
 * 이슈 #17 과제 C — 서버 신뢰도 연동(공장 유효 최대 등급·XP 보너스·기능 제한)
 * 통합 테스트.
 *
 * 근거: `docs/design/07-global-system.md` §신뢰도 효과, 확정 결정 1·6·7.
 */

/** 테스트 유저 + 시작 토지(index 1) + 창고를 시드한다. */
async function seedUser(
  id: string,
  opts: { money?: bigint; level?: number } = {}
) {
  const user = await testPrisma.user.create({
    data: {
      id,
      money: opts.money ?? 1_000_000_000n,
      level: opts.level ?? 30
    }
  })
  const warehouse = await testPrisma.warehouse.create({
    data: { userId: user.id }
  })
  await testPrisma.$transaction(async (tx) => {
    await createLandWithSlots(tx, user.id, 1)
  })
  return { user, warehouse }
}

/** 지정 신뢰도를 가진 테스트 길드를 시드한다. */
async function seedGuild(id: string, credit: number) {
  return testPrisma.guild.create({
    data: { id, name: `guild-${id}`, credit }
  })
}

/** 창고에 특정 자재를 지정 수량으로 보장한다. */
async function ensureMaterial(
  warehouseId: string,
  material: Parameters<
    typeof testPrisma.warehouseStack.create
  >[0]['data']['material'],
  count: bigint
) {
  await testPrisma.warehouseStack.upsert({
    where: { warehouseId_material: { warehouseId, material } },
    create: { warehouseId, material, count },
    update: { count }
  })
}

/** FARM 을 (0,0)에 건설하고 원하는 등급으로 직접 세팅한다(업그레이드 경로 우회). */
async function buildFarmAtGrade(
  userId: string,
  grade: number
): Promise<string> {
  const { factory } = await FactoryService.build(testPrisma, {
    userId,
    landIndex: 1,
    type: 'FARM',
    anchorX: 0,
    anchorY: 0
  })
  if (grade !== factory.grade) {
    await testPrisma.factory.update({
      where: { id: factory.id },
      data: { grade }
    })
  }
  return factory.id
}

describe('FactoryService — 신뢰도 연동', () => {
  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await closeDb()
  })

  describe('effectiveMaxGrade 업그레이드 가드 (grade 8→9 경계)', () => {
    it('신뢰도 999(maxGrade 8): grade 8 업그레이드를 MAX_GRADE로 차단하고 상한값을 컨텍스트에 담는다', async () => {
      const { user, warehouse } = await seedUser('u-c-999')
      await seedGuild('g-999', 999)
      await ensureMaterial(warehouse.id, 'GRAIN', 100_000n)
      const factoryId = await buildFarmAtGrade(user.id, 8)

      const err = await FactoryService.upgrade(testPrisma, {
        userId: user.id,
        factoryId,
        guildId: 'g-999'
      }).catch((e) => e)

      expect(err).toBeInstanceOf(ServiceError)
      expect(err.code).toBe('MAX_GRADE')
      expect(err.details).toMatchObject({ maxGrade: 8 })
    })

    it('신뢰도 1000(maxGrade 9): grade 8 → 9 업그레이드를 허용한다', async () => {
      const { user, warehouse } = await seedUser('u-c-1000')
      await seedGuild('g-1000', 1000)
      await ensureMaterial(warehouse.id, 'GRAIN', 100_000n)
      const factoryId = await buildFarmAtGrade(user.id, 8)

      const { factory } = await FactoryService.upgrade(testPrisma, {
        userId: user.id,
        factoryId,
        guildId: 'g-1000'
      })
      expect(factory.grade).toBe(9)
    })

    it('신뢰도 1000(maxGrade 9): grade 9 는 다시 MAX_GRADE로 차단한다', async () => {
      const { user, warehouse } = await seedUser('u-c-1000b')
      await seedGuild('g-1000b', 1000)
      await ensureMaterial(warehouse.id, 'GRAIN', 1_000_000n)
      const factoryId = await buildFarmAtGrade(user.id, 9)

      const err = await FactoryService.upgrade(testPrisma, {
        userId: user.id,
        factoryId,
        guildId: 'g-1000b'
      }).catch((e) => e)
      expect(err).toBeInstanceOf(ServiceError)
      expect(err.code).toBe('MAX_GRADE')
      expect(err.details).toMatchObject({ maxGrade: 9 })
    })

    it('신뢰도 1500(maxGrade 10): grade 8 → 9, 9 → 10 까지 허용한다', async () => {
      const { user, warehouse } = await seedUser('u-c-1500')
      await seedGuild('g-1500', 1500)
      await ensureMaterial(warehouse.id, 'GRAIN', 100_000_000n)
      const factoryId = await buildFarmAtGrade(user.id, 8)

      const up1 = await FactoryService.upgrade(testPrisma, {
        userId: user.id,
        factoryId,
        guildId: 'g-1500'
      })
      expect(up1.factory.grade).toBe(9)

      const up2 = await FactoryService.upgrade(testPrisma, {
        userId: user.id,
        factoryId,
        guildId: 'g-1500'
      })
      expect(up2.factory.grade).toBe(10)
    })
  })

  describe('XP 보너스 (bps 0 / 1000 / 2000)', () => {
    // grade 4 → 5 업그레이드는 base XP 가 충분히 커서(=81) 티어별 배율 차이가 드러난다.
    const UPGRADE_GRADE = 4
    const baseCost = upgradeMoneyCost('FARM', UPGRADE_GRADE)
    const baseXp = xpForEvent({ kind: 'UPGRADE', cost: baseCost })

    async function measureUpgradeXp(
      userSuffix: string,
      guildId: string,
      credit: number
    ): Promise<bigint> {
      const { user, warehouse } = await seedUser(`u-xp-${userSuffix}`)
      await seedGuild(guildId, credit)
      await ensureMaterial(warehouse.id, 'GRAIN', 1_000_000n)
      const factoryId = await buildFarmAtGrade(user.id, UPGRADE_GRADE)

      const before = await testPrisma.user.findUniqueOrThrow({
        where: { id: user.id }
      })
      await FactoryService.upgrade(testPrisma, {
        userId: user.id,
        factoryId,
        guildId
      })
      const after = await testPrisma.user.findUniqueOrThrow({
        where: { id: user.id }
      })
      return after.xp - before.xp
    }

    it('신뢰도 700(NORMAL, bps 0): 보너스 없이 기본 XP', async () => {
      const delta = await measureUpgradeXp('n', 'g-xp-700', 700)
      const expected = (baseXp * BigInt(10000 + creditXpBonusBps(700))) / 10000n
      expect(delta).toBe(expected)
      expect(delta).toBe(baseXp)
    })

    it('신뢰도 1000(TRUSTED, bps 1000): +10% XP', async () => {
      const delta = await measureUpgradeXp('t', 'g-xp-1000', 1000)
      const expected =
        (baseXp * BigInt(10000 + creditXpBonusBps(1000))) / 10000n
      expect(delta).toBe(expected)
      expect(delta).toBeGreaterThan(baseXp)
    })

    it('신뢰도 1500(ELITE, bps 2000): +20% XP', async () => {
      const delta = await measureUpgradeXp('e', 'g-xp-1500', 1500)
      const expected =
        (baseXp * BigInt(10000 + creditXpBonusBps(1500))) / 10000n
      expect(delta).toBe(expected)
      expect(delta).toBeGreaterThan(baseXp)
    })

    it('세 티어의 XP 는 단조 증가한다 (700 < 1000 < 1500)', () => {
      const n = (baseXp * BigInt(10000 + creditXpBonusBps(700))) / 10000n
      const t = (baseXp * BigInt(10000 + creditXpBonusBps(1000))) / 10000n
      const e = (baseXp * BigInt(10000 + creditXpBonusBps(1500))) / 10000n
      expect(n < t).toBe(true)
      expect(t < e).toBe(true)
    })
  })

  describe('건설(BUILD) XP + 보너스', () => {
    it('건설 시 BUILD XP 를 지급한다 (guildId 없음 → 배율 없음)', async () => {
      const { user } = await seedUser('u-build-xp')
      const before = await testPrisma.user.findUniqueOrThrow({
        where: { id: user.id }
      })
      await FactoryService.build(testPrisma, {
        userId: user.id,
        landIndex: 1,
        type: 'FARM',
        anchorX: 0,
        anchorY: 0
      })
      const after = await testPrisma.user.findUniqueOrThrow({
        where: { id: user.id }
      })
      const expected = xpForEvent({ kind: 'BUILD', cost: 1_000n })
      expect(after.xp - before.xp).toBe(expected)
    })

    it('신뢰도 1500 서버에서 건설 XP 에 +20% 배율이 적용된다', async () => {
      const { user, warehouse } = await seedUser('u-build-xp-elite', {
        level: 30
      })
      await seedGuild('g-build-1500', 1500)
      await ensureMaterial(warehouse.id, 'STEEL', 1_000n)
      const before = await testPrisma.user.findUniqueOrThrow({
        where: { id: user.id }
      })
      await FactoryService.build(testPrisma, {
        userId: user.id,
        landIndex: 1,
        type: 'CAR_FACTORY',
        anchorX: 0,
        anchorY: 0,
        guildId: 'g-build-1500'
      })
      const after = await testPrisma.user.findUniqueOrThrow({
        where: { id: user.id }
      })
      const baseXp = xpForEvent({ kind: 'BUILD', cost: 100_000n })
      const expected = (baseXp * BigInt(10000 + 2000)) / 10000n
      expect(after.xp - before.xp).toBe(expected)
      expect(after.xp - before.xp).toBeGreaterThan(baseXp)
    })
  })

  describe('credit < 300 기능 제한 (확정 결정 7)', () => {
    it('신뢰도 299 서버: 건설을 CREDIT_RESTRICTED 로 차단한다', async () => {
      const { user } = await seedUser('u-r-build')
      await seedGuild('g-r-299', 299)

      const err = await FactoryService.build(testPrisma, {
        userId: user.id,
        landIndex: 1,
        type: 'FARM',
        anchorX: 0,
        anchorY: 0,
        guildId: 'g-r-299'
      }).catch((e) => e)
      expect(err).toBeInstanceOf(ServiceError)
      expect(err.code).toBe('CREDIT_RESTRICTED')
      expect(err.details).toMatchObject({ credit: 299 })
    })

    it('신뢰도 300 서버: 건설을 허용한다 (경계 포함)', async () => {
      const { user } = await seedUser('u-r-build-ok')
      await seedGuild('g-r-300', 300)

      const { factory } = await FactoryService.build(testPrisma, {
        userId: user.id,
        landIndex: 1,
        type: 'FARM',
        anchorX: 0,
        anchorY: 0,
        guildId: 'g-r-300'
      })
      expect(factory.grade).toBe(1)
    })

    it('신뢰도 299 서버: 업그레이드를 CREDIT_RESTRICTED 로 차단한다', async () => {
      const { user, warehouse } = await seedUser('u-r-up')
      await seedGuild('g-r-up-299', 299)
      await ensureMaterial(warehouse.id, 'GRAIN', 100n)
      // credit 999 인 별도 서버에서 건설 후, 299 서버에서 업그레이드 시도.
      const factoryId = await buildFarmAtGrade(user.id, 1)

      const err = await FactoryService.upgrade(testPrisma, {
        userId: user.id,
        factoryId,
        guildId: 'g-r-up-299'
      }).catch((e) => e)
      expect(err).toBeInstanceOf(ServiceError)
      expect(err.code).toBe('CREDIT_RESTRICTED')
    })
  })

  describe('guildId null 폴백 (기본 상한 8 · 보너스 없음)', () => {
    it('guildId 없이 grade 8 업그레이드는 BASE_MAX_GRADE(8)로 차단된다', async () => {
      const { user, warehouse } = await seedUser('u-null-8')
      await ensureMaterial(warehouse.id, 'GRAIN', 1_000_000n)
      const factoryId = await buildFarmAtGrade(user.id, 8)

      const err = await FactoryService.upgrade(testPrisma, {
        userId: user.id,
        factoryId
      }).catch((e) => e)
      expect(err).toBeInstanceOf(ServiceError)
      expect(err.code).toBe('MAX_GRADE')
      expect(err.details).toMatchObject({ maxGrade: 8 })
    })

    it('guildId 없이 grade 7 → 8 업그레이드는 허용된다', async () => {
      const { user, warehouse } = await seedUser('u-null-7')
      await ensureMaterial(warehouse.id, 'GRAIN', 1_000_000n)
      const factoryId = await buildFarmAtGrade(user.id, 7)

      const { factory } = await FactoryService.upgrade(testPrisma, {
        userId: user.id,
        factoryId
      })
      expect(factory.grade).toBe(8)
    })

    it('존재하지 않는 guildId(신뢰도 미상)도 BASE_MAX_GRADE(8) 폴백으로 처리한다', async () => {
      const { user, warehouse } = await seedUser('u-ghost')
      await ensureMaterial(warehouse.id, 'GRAIN', 1_000_000n)
      const factoryId = await buildFarmAtGrade(user.id, 8)

      const err = await FactoryService.upgrade(testPrisma, {
        userId: user.id,
        factoryId,
        guildId: 'g-does-not-exist'
      }).catch((e) => e)
      expect(err).toBeInstanceOf(ServiceError)
      expect(err.code).toBe('MAX_GRADE')
      expect(err.details).toMatchObject({ maxGrade: 8 })
    })
  })

  describe('info() effectiveMaxGrade 노출', () => {
    it('신뢰도별 effectiveMaxGrade 를 DTO 에 노출한다', async () => {
      const { user } = await seedUser('u-info')
      await seedGuild('g-info-1500', 1500)
      const factoryId = await buildFarmAtGrade(user.id, 1)

      const infoNull = await FactoryService.info(testPrisma, factoryId)
      expect(infoNull.effectiveMaxGrade).toBe(8)

      const infoElite = await FactoryService.info(
        testPrisma,
        factoryId,
        'g-info-1500'
      )
      expect(infoElite.effectiveMaxGrade).toBe(effectiveMaxGrade(1500))
      expect(infoElite.effectiveMaxGrade).toBe(10)
    })
  })
})
