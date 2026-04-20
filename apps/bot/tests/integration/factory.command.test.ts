import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { FactoryService } from '../../src/services/factory'
import { UserService } from '../../src/services/user'
import { ServiceError } from '../../src/services/base'
import { closeDb, resetDb, testPrisma } from './setup'

/**
 * `/factory` 커맨드 레이어 통합 테스트.
 *
 * Discord 인터랙션 어댑터 자체는 매우 얇으므로, 여기서는 커맨드 핸들러가
 * 실제로 수행하는 서비스 연쇄(`UserService.ensure` → `FactoryService.*`)를
 * 직접 호출하여 검증한다.
 *
 * `factory.service.test.ts`와의 중복을 피하기 위해 커맨드 계층 특화 항목만
 * 다룬다: discordId → user.ensure 자동 생성, info 응답 DTO 모양 등.
 */
describe('FactoryCommand (service chain)', () => {
  const discordId = '111111111111111111'

  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await closeDb()
  })

  it('ensures a user (and land/warehouse) before build and then places a FARM', async () => {
    // /factory build FARM x=0 y=0
    const ensured = await UserService.ensure(testPrisma, { discordId })
    expect(ensured.id).toBe(discordId)
    expect(ensured.land).not.toBeNull()
    expect(ensured.warehouse).not.toBeNull()

    // 초기 money 는 기본값이 0이므로 충전해둬야 build 가능
    await testPrisma.user.update({
      where: { id: discordId },
      data: { money: 10_000n }
    })

    const factory = await FactoryService.build(testPrisma, {
      userId: discordId,
      type: 'FARM',
      anchorX: 0,
      anchorY: 0
    })
    expect(factory.type).toBe('FARM')
    expect(factory.grade).toBe(1)

    // info DTO shape (커맨드 렌더러에서 사용하는 nextUpgradeCost.material.material)
    const info = await FactoryService.info(testPrisma, factory.id)
    expect(info.id).toBe(factory.id)
    expect(info.nextUpgradeCost.money).not.toBeNull()
    expect(info.nextUpgradeCost.material).not.toBeNull()
    expect(info.nextUpgradeCost.material?.material).toBe('GRAIN')
  })

  it('surfaces FACTORY_NOT_FOUND when info is called with unknown id', async () => {
    await expect(
      FactoryService.info(testPrisma, '00000000-0000-0000-0000-000000000000')
    ).rejects.toMatchObject({
      name: 'ServiceError',
      code: 'FACTORY_NOT_FOUND'
    })
  })

  it('setmode rejects FACTORY_NOT_FOUND for non-owner user', async () => {
    await UserService.ensure(testPrisma, { discordId })
    await UserService.ensure(testPrisma, { discordId: '222222222222222222' })
    await testPrisma.user.update({
      where: { id: discordId },
      data: { money: 10_000n }
    })

    const factory = await FactoryService.build(testPrisma, {
      userId: discordId,
      type: 'FARM',
      anchorX: 0,
      anchorY: 0
    })

    await expect(
      FactoryService.setMode(testPrisma, {
        userId: '222222222222222222',
        factoryId: factory.id,
        mode: 'PAUSE'
      })
    ).rejects.toBeInstanceOf(ServiceError)
  })
})
