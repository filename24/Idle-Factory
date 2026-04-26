import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { QuestService, TUTORIAL_ENTRY_QUEST_ID } from '../../src/services/quest'
import { UserService } from '../../src/services/user'
import { runInTx } from '../../src/services/base'
import { closeDb, resetDb, testPrisma } from './setup'

async function seedConsentedUser(id: string) {
  await UserService.ensure(testPrisma, { discordId: id })
  await testPrisma.user.update({
    where: { id },
    data: {
      agreedTermsAt: new Date(),
      agreedPrivacyAt: new Date(),
      agreedTermsVersion: 'v1',
      agreedPrivacyVersion: 'v1'
    }
  })
}

describe('QuestService.seedTutorial', () => {
  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await closeDb()
  })

  it('creates tutorial.1 in IN_PROGRESS state', async () => {
    await seedConsentedUser('u-seed')

    const seeded = await runInTx(testPrisma, (tx) =>
      QuestService.seedTutorial(tx, 'u-seed')
    )

    expect(seeded.questId).toBe(TUTORIAL_ENTRY_QUEST_ID)
    expect(seeded.status).toBe('IN_PROGRESS')
    expect(seeded.kind).toBe('TUTORIAL')
    expect(seeded.target).toBe(1n)
    expect(seeded.progress).toBe(0n)
  })

  it('is idempotent — second call does not create a duplicate row', async () => {
    await seedConsentedUser('u-seed-2')

    await runInTx(testPrisma, (tx) => QuestService.seedTutorial(tx, 'u-seed-2'))
    await runInTx(testPrisma, (tx) => QuestService.seedTutorial(tx, 'u-seed-2'))

    const rows = await testPrisma.userQuest.findMany({
      where: { userId: 'u-seed-2', questId: 'tutorial.1' }
    })
    expect(rows).toHaveLength(1)
  })

  it('snapshots target and rewards from the catalog', async () => {
    await seedConsentedUser('u-snap')

    const seeded = await runInTx(testPrisma, (tx) =>
      QuestService.seedTutorial(tx, 'u-snap')
    )

    expect(seeded.target).toBe(1n)
    expect(seeded.rewardSnapshot).toEqual([{ kind: 'MONEY', amount: '1000' }])
  })
})

describe('QuestService.progress', () => {
  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await closeDb()
  })

  it('matching event flips IN_PROGRESS → COMPLETED for tutorial.1 (FACTORY_BUILT T1)', async () => {
    await seedConsentedUser('u-prog')
    await runInTx(testPrisma, (tx) => QuestService.seedTutorial(tx, 'u-prog'))

    const result = await runInTx(testPrisma, (tx) =>
      QuestService.progress(tx, 'u-prog', {
        kind: 'FACTORY_BUILT',
        tier: 'T1',
        type: 'FARM',
        ownedAfter: 1
      })
    )

    expect(result.newlyCompleted).toHaveLength(1)
    expect(result.newlyCompleted[0]?.questId).toBe('tutorial.1')
    expect(result.newlyCompleted[0]?.status).toBe('COMPLETED')

    const row = await testPrisma.userQuest.findFirstOrThrow({
      where: { userId: 'u-prog', questId: 'tutorial.1' }
    })
    expect(row.progress).toBe(1n)
    expect(row.completedAt).not.toBeNull()
  })

  it('non-matching event leaves progress unchanged', async () => {
    await seedConsentedUser('u-noop')
    await runInTx(testPrisma, (tx) => QuestService.seedTutorial(tx, 'u-noop'))

    const result = await runInTx(testPrisma, (tx) =>
      QuestService.progress(tx, 'u-noop', {
        kind: 'FACTORY_HARVESTED',
        factoryIds: ['f'],
        tickTotal: 1
      })
    )

    expect(result.newlyCompleted).toEqual([])
    const row = await testPrisma.userQuest.findFirstOrThrow({
      where: { userId: 'u-noop', questId: 'tutorial.1' }
    })
    expect(row.progress).toBe(0n)
    expect(row.status).toBe('IN_PROGRESS')
  })

  it('does NOT auto-claim on completion (manual claim required)', async () => {
    await seedConsentedUser('u-manual')
    const before = (
      await testPrisma.user.findUniqueOrThrow({ where: { id: 'u-manual' } })
    ).money
    await runInTx(testPrisma, (tx) => QuestService.seedTutorial(tx, 'u-manual'))

    await runInTx(testPrisma, (tx) =>
      QuestService.progress(tx, 'u-manual', {
        kind: 'FACTORY_BUILT',
        tier: 'T1',
        type: 'FARM',
        ownedAfter: 1
      })
    )

    const user = await testPrisma.user.findUniqueOrThrow({
      where: { id: 'u-manual' }
    })
    expect(user.money).toBe(before) // 보상 미지급
  })

  it('returns empty when user has no active quests', async () => {
    await seedConsentedUser('u-none')

    const result = await runInTx(testPrisma, (tx) =>
      QuestService.progress(tx, 'u-none', {
        kind: 'FACTORY_HARVESTED',
        factoryIds: [],
        tickTotal: 0
      })
    )

    expect(result.newlyCompleted).toEqual([])
  })
})

describe('QuestService.claim', () => {
  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await closeDb()
  })

  it('grants reward + flips COMPLETED → CLAIMED + seeds chain.next', async () => {
    await seedConsentedUser('u-claim')
    const moneyBefore = (
      await testPrisma.user.findUniqueOrThrow({ where: { id: 'u-claim' } })
    ).money
    await runInTx(testPrisma, (tx) => QuestService.seedTutorial(tx, 'u-claim'))
    await runInTx(testPrisma, (tx) =>
      QuestService.progress(tx, 'u-claim', {
        kind: 'FACTORY_BUILT',
        tier: 'T1',
        type: 'FARM',
        ownedAfter: 1
      })
    )

    const result = await runInTx(testPrisma, (tx) =>
      QuestService.claim(tx, 'u-claim', 'tutorial.1')
    )

    expect(result.claimed.status).toBe('CLAIMED')
    expect(result.claimed.claimedAt).not.toBeNull()
    expect(result.grants).toEqual([{ kind: 'MONEY', amount: 1_000n }])
    expect(result.unlocked?.questId).toBe('tutorial.2')
    expect(result.unlocked?.status).toBe('IN_PROGRESS')

    const user = await testPrisma.user.findUniqueOrThrow({
      where: { id: 'u-claim' }
    })
    expect(user.money).toBe(moneyBefore + 1_000n)
  })

  it('throws QUEST_NOT_COMPLETED when status is IN_PROGRESS', async () => {
    await seedConsentedUser('u-still')
    await runInTx(testPrisma, (tx) => QuestService.seedTutorial(tx, 'u-still'))

    await expect(
      runInTx(testPrisma, (tx) =>
        QuestService.claim(tx, 'u-still', 'tutorial.1')
      )
    ).rejects.toMatchObject({
      name: 'ServiceError',
      code: 'QUEST_NOT_COMPLETED'
    })
  })

  it('throws QUEST_NOT_FOUND when row is missing', async () => {
    await seedConsentedUser('u-miss')

    await expect(
      runInTx(testPrisma, (tx) =>
        QuestService.claim(tx, 'u-miss', 'tutorial.1')
      )
    ).rejects.toMatchObject({ name: 'ServiceError', code: 'QUEST_NOT_FOUND' })
  })

  it('is idempotent — second claim on CLAIMED row returns empty grants', async () => {
    await seedConsentedUser('u-double')
    await runInTx(testPrisma, (tx) => QuestService.seedTutorial(tx, 'u-double'))
    await runInTx(testPrisma, (tx) =>
      QuestService.progress(tx, 'u-double', {
        kind: 'FACTORY_BUILT',
        tier: 'T1',
        type: 'FARM',
        ownedAfter: 1
      })
    )
    await runInTx(testPrisma, (tx) =>
      QuestService.claim(tx, 'u-double', 'tutorial.1')
    )

    const moneyAfterFirst = (
      await testPrisma.user.findUniqueOrThrow({ where: { id: 'u-double' } })
    ).money

    const second = await runInTx(testPrisma, (tx) =>
      QuestService.claim(tx, 'u-double', 'tutorial.1')
    )

    expect(second.grants).toEqual([])
    expect(second.unlocked).toBeNull()
    const user = await testPrisma.user.findUniqueOrThrow({
      where: { id: 'u-double' }
    })
    expect(user.money).toBe(moneyAfterFirst) // 재지급 없음
  })

  it('terminal node tutorial.5 unlocks nothing on claim', async () => {
    await seedConsentedUser('u-end')
    // tutorial.5 행 직접 시드
    await testPrisma.userQuest.create({
      data: {
        userId: 'u-end',
        questId: 'tutorial.5',
        kind: 'TUTORIAL',
        status: 'COMPLETED',
        progress: 2n,
        target: 2n,
        rewardSnapshot: [{ kind: 'MONEY', amount: '1000' }] as never,
        completedAt: new Date()
      }
    })

    const result = await runInTx(testPrisma, (tx) =>
      QuestService.claim(tx, 'u-end', 'tutorial.5')
    )

    expect(result.unlocked).toBeNull()
  })
})

describe('QuestService.listVisible', () => {
  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await closeDb()
  })

  it('returns IN_PROGRESS + COMPLETED but excludes CLAIMED', async () => {
    await seedConsentedUser('u-list')
    await runInTx(testPrisma, (tx) => QuestService.seedTutorial(tx, 'u-list'))
    await runInTx(testPrisma, (tx) =>
      QuestService.progress(tx, 'u-list', {
        kind: 'FACTORY_BUILT',
        tier: 'T1',
        type: 'FARM',
        ownedAfter: 1
      })
    )

    let visible = await QuestService.listVisible(testPrisma, 'u-list')
    expect(visible.map((q) => q.questId)).toEqual(['tutorial.1'])
    expect(visible[0]?.status).toBe('COMPLETED')

    await runInTx(testPrisma, (tx) =>
      QuestService.claim(tx, 'u-list', 'tutorial.1')
    )
    visible = await QuestService.listVisible(testPrisma, 'u-list')
    expect(visible.map((q) => q.questId)).toEqual(['tutorial.2'])
  })

  it('returns empty after the entire tutorial chain is claimed', async () => {
    await seedConsentedUser('u-done')

    const visible = await QuestService.listVisible(testPrisma, 'u-done')
    expect(visible).toEqual([])
  })
})
