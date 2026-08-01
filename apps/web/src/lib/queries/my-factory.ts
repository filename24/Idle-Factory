import {
  BASE_MAX_GRADE,
  FACTORY_CATALOG,
  buildCost,
  computeLandSynergies,
  destroyRefund,
  effectiveMaxGrade,
  getFactoryEntry,
  getSpecialSlotBonus,
  getSynergyMultiplier,
  moveCost,
  upgradeMaterialCost,
  upgradeMoneyCost,
  type FactoryTier,
  type FactoryType,
  type MaterialType,
  type SlotType,
} from '@idle/game-core'
import { db } from '../db'

/**
 * 내 공장 상세 조회 계층.
 *
 * 등급별 비용·생산량·특수 슬롯·시너지는 전부 `@idle/game-core` 에서 가져온다.
 * 웹에서 숫자를 다시 적으면 봇과 어긋난다 — 파리티 감사가 지적한 드리프트가
 * 정확히 그렇게 생긴다.
 */

/** 자재 수량 한 줄. bigint 는 문자열로 내린다. */
export interface MaterialAmountDto {
  readonly material: MaterialType
  readonly amount: string
}

/** 다음 등급 업그레이드 비용. 최대 등급이면 null. */
export interface NextUpgradeCostDto {
  readonly toGrade: number
  readonly money: string
  readonly material: MaterialAmountDto
}

/** 시너지 기여 요인 한 줄 — UI 설명용. */
export interface FactoryBonusDto {
  /** 특수 슬롯 배수 (1.0 / 1.2 / 1.3). */
  readonly slotBonus: number
  /** 인접 시너지 배수 (1.0 ~ 1.3). */
  readonly synergyBonus: number
  /** 두 배수를 곱한 값. */
  readonly total: number
}

/** 공장 상세 DTO. */
export interface MyFactoryDetail {
  readonly id: string
  readonly landIndex: number
  readonly type: FactoryType
  readonly tier: FactoryTier
  readonly grade: number
  /**
   * 서버 신뢰도로 결정되는 유효 최대 등급.
   *
   * 길드 맥락이 없으면 기본값(`BASE_MAX_GRADE`)을 쓴다 — 봇의
   * `services/factory.ts` 와 같은 폴백이다.
   */
  readonly effectiveMaxGrade: number
  readonly anchorX: number
  readonly anchorY: number
  readonly width: number
  readonly height: number
  readonly slotType: SlotType
  readonly shortageMode: string
  readonly upgradeBooster: string | null
  readonly hasRawBooster: boolean
  readonly unlockLevel: number
  readonly bonus: FactoryBonusDto
  /** tick(10분)당 기본 산출 — 등급·보너스 적용 전 카탈로그 값. */
  readonly baseProduction: MaterialAmountDto
  /** tick 당 부산물. 대부분 빈 배열. */
  readonly secondaryOutputs: readonly MaterialAmountDto[]
  /** tick 당 필요한 원료. T1 은 빈 배열. */
  readonly recipe: readonly MaterialAmountDto[]
  readonly nextUpgrade: NextUpgradeCostDto | null
  /** 철거 시 환급액. */
  readonly destroyRefund: string
  /** 같은 토지 안에서 이전할 때의 비용. */
  readonly moveCost: string
  /** 건설 원가 — 비교 표시용. */
  readonly buildCost: string
  readonly lastHarvestAt: string
  /** 상장된 공장인가. 상장 중이면 철거할 수 없다. */
  readonly isListed: boolean
}

/**
 * 공장 상세를 조회한다.
 *
 * `where` 에 `userId` 를 함께 걸어 남의 공장 id 로는 아무것도 나오지 않게 한다.
 * 존재하지 않는 id 와 남의 id 를 구분하지 않는 것도 의도한 것이다.
 *
 * @param gameUserId 게임 User.id
 * @param factoryId 공장 id
 * @returns 상세 DTO. 없거나 남의 것이면 `null`
 */
export async function getMyFactory(
  gameUserId: string,
  factoryId: string,
): Promise<MyFactoryDetail | null> {
  const factory = await db.factory.findFirst({
    where: { id: factoryId, userId: gameUserId },
    select: {
      id: true,
      type: true,
      tier: true,
      grade: true,
      anchorX: true,
      anchorY: true,
      width: true,
      height: true,
      shortageMode: true,
      upgradeBooster: true,
      hasRawBooster: true,
      lastHarvestAt: true,
      guildId: true,
      stock: { select: { id: true } },
      land: {
        select: {
          index: true,
          slots: { select: { x: true, y: true, type: true, locked: true } },
          factories: {
            select: {
              id: true,
              type: true,
              anchorX: true,
              anchorY: true,
              width: true,
              height: true,
            },
          },
        },
      },
    },
  })

  if (!factory) return null

  const entry = getFactoryEntry(factory.type as FactoryType)

  // 시너지는 토지 전체 배치를 봐야 나온다.
  const synergyMap = computeLandSynergies({
    factories: factory.land.factories.map((f) => ({
      id: f.id,
      type: f.type as FactoryType,
      anchorX: f.anchorX,
      anchorY: f.anchorY,
      width: f.width,
      height: f.height,
    })),
    slots: factory.land.slots.map((s) => ({
      x: s.x,
      y: s.y,
      type: s.type as SlotType,
      locked: s.locked,
    })),
  })

  const anchorSlot = factory.land.slots.find(
    (s) => s.x === factory.anchorX && s.y === factory.anchorY,
  )
  const slotType = (anchorSlot?.type ?? 'NORMAL') as SlotType

  const slotBonus = getSpecialSlotBonus(slotType, factory.type as FactoryType)
  const synergyBonus = getSynergyMultiplier(synergyMap, factory.id)

  const maxGrade = await resolveMaxGrade(factory.guildId)

  return {
    id: factory.id,
    landIndex: factory.land.index,
    type: factory.type as FactoryType,
    tier: factory.tier as FactoryTier,
    grade: factory.grade,
    effectiveMaxGrade: maxGrade,
    anchorX: factory.anchorX,
    anchorY: factory.anchorY,
    width: factory.width,
    height: factory.height,
    slotType,
    shortageMode: factory.shortageMode,
    upgradeBooster: factory.upgradeBooster,
    hasRawBooster: factory.hasRawBooster,
    unlockLevel: entry.unlockLevel,
    bonus: {
      slotBonus,
      synergyBonus,
      // 소수 곱셈 오차가 UI 에 1.2000000000000002 로 새지 않게 다듬는다.
      total: Math.round(slotBonus * synergyBonus * 1000) / 1000,
    },
    baseProduction: { material: entry.output, amount: entry.baseProduction.toString() },
    secondaryOutputs: entry.secondaryOutputs.map((o) => ({
      material: o.material,
      amount: o.amount.toString(),
    })),
    recipe: entry.recipe.map((r) => ({ material: r.material, amount: r.amount.toString() })),
    nextUpgrade:
      factory.grade < maxGrade
        ? {
            toGrade: factory.grade + 1,
            money: upgradeMoneyCost(factory.type as FactoryType, factory.grade).toString(),
            material: {
              material: entry.upgradeMaterialBase.material,
              amount: upgradeMaterialCost(
                factory.type as FactoryType,
                factory.grade,
              ).amount.toString(),
            },
          }
        : null,
    destroyRefund: destroyRefund(factory.type as FactoryType).toString(),
    moveCost: moveCost(factory.type as FactoryType).toString(),
    buildCost: buildCost(factory.type as FactoryType).toString(),
    lastHarvestAt: factory.lastHarvestAt.toISOString(),
    isListed: factory.stock !== null,
  }
}

/**
 * 길드 신뢰도로 유효 최대 등급을 정한다.
 *
 * 길드 맥락이 없거나 길드 행이 없으면 기본 상한을 쓴다. 봇
 * (`apps/bot/src/services/factory.ts`)과 같은 폴백이라 두 표면이 같은 값을 보인다.
 *
 * @param guildId 공장이 속한 길드 id
 */
async function resolveMaxGrade(guildId: string | null): Promise<number> {
  if (!guildId) return BASE_MAX_GRADE

  const guild = await db.guild.findUnique({ where: { id: guildId }, select: { credit: true } })
  return guild ? effectiveMaxGrade(guild.credit) : BASE_MAX_GRADE
}

/** 카탈로그가 아는 공장 종류인지 확인한다. */
export function isKnownFactoryType(value: string): value is FactoryType {
  return value in FACTORY_CATALOG
}
