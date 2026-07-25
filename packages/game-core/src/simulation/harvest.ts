/**
 * 시뮬레이션 수확 단계 — `computeFactoryYield` 조립.
 *
 * 런타임(`apps/bot/src/services/harvest.ts`)과 달리 DB 트랜잭션이 없으므로
 * 공장을 순차로 돌면서 창고 여유를 갱신한다. 같은 유저의 공장 여러 채가
 * 하나의 창고를 공유하기 때문에 **처리 순서가 결과에 영향을 준다** — 창고가
 * 가득 차기 직전이면 먼저 계산된 공장이 남은 공간을 가져간다. 실제 런타임도
 * 같은 성질을 가지므로(수확은 공장 단위로 순차 반영) 모델 왜곡은 아니지만,
 * 공장 배열 순서가 결정적이어야 재현성이 유지된다.
 */

import { getFactoryEntry } from '../factories/catalog'
import { computeFactoryYield, MAX_TICKS_PER_HARVEST } from '../factories/production'
import type { FactoryState, MaterialBag, MaterialType } from '../types'
import { computeFree } from '../warehouse/capacity'
import type { MutableUser } from './state'

/** 한 번의 수확 결과 요약. */
export interface HarvestOutcome {
  /** 실제로 정산된 tick 수 합계 (공장별 합). */
  readonly ticksRealized: number
  /** 창고 한도에 막힌 공장이 하나라도 있었는지. */
  readonly choked: boolean
  /** 생산된 총 단위 수 — 진단용. */
  readonly unitsProduced: bigint
}

/**
 * `computeFactoryYield` 가 요구하는 `FactoryState` 를 만든다.
 *
 * 시뮬레이터는 시간축을 tick 인덱스로 다루므로 `lastHarvestAt`(Date)은 쓰지
 * 않는다 — `elapsedTicks` 를 직접 넘기는 경로라 이 필드는 참조되지 않는다.
 * 타입을 만족시키기 위한 더미이며, 여기에 의미를 부여하지 말 것.
 */
function toFactoryState(type: FactoryState['type'], grade: number): FactoryState {
  return {
    type,
    grade,
    lastHarvestAt: new Date(0),
    shortageMode: 'PAUSE',
    upgradeBooster: null,
    hasRawBooster: false,
  }
}

/** bag 에서 자재를 차감한다 (0 이하가 되면 키 제거). */
function subtractFromBag(bag: MaterialBag, material: MaterialType, amount: bigint): void {
  if (amount <= 0n) return
  const next = (bag[material] ?? 0n) - amount
  if (next > 0n) bag[material] = next
  else delete bag[material]
}

/** bag 에 자재를 더한다. */
function addToBag(bag: MaterialBag, material: MaterialType, amount: bigint): void {
  if (amount <= 0n) return
  bag[material] = (bag[material] ?? 0n) + amount
}

/**
 * 유저의 모든 공장을 수확해 창고에 반영한다.
 *
 * 슬롯 보너스·시너지는 1.0 으로 고정한다 — 시뮬레이터 v1 은 토지 좌표를
 * 모사하지 않으므로 인접 시너지(최대 +30%)와 특수 슬롯 보너스가 빠져 있다.
 * 따라서 산출 수익은 **보수적 하한**이다 (리포트 §모델 한계에 명시).
 *
 * @param user 대상 유저 (내부 상태가 갱신된다)
 * @param tick 현재 tick 인덱스
 * @returns 수확 요약
 */
export function harvestUser(user: MutableUser, tick: number): HarvestOutcome {
  let ticksRealized = 0
  let choked = false
  let unitsProduced = 0n

  for (const factory of user.factories) {
    const elapsed = Math.min(tick - factory.lastHarvestTick, MAX_TICKS_PER_HARVEST)
    if (elapsed <= 0) continue

    const warehouseFree = computeFree(user.warehouseGrade, user.stacks)
    const result = computeFactoryYield({
      factory: toFactoryState(factory.type, factory.grade),
      availableMaterials: user.stacks,
      warehouseFree,
      elapsedTicks: elapsed,
      slotBonus: 1.0,
      synergyBonus: 1.0,
    })

    if (result.ticksRealized < elapsed) choked = true
    if (result.ticksRealized <= 0) {
      // 원료·창고 어느 쪽에도 여유가 없어 한 tick 도 못 돌린 경우.
      // lastHarvestTick 을 전진시키지 않아야 다음 접속에서 미수확분이 살아난다.
      continue
    }

    for (const [material, amount] of Object.entries(result.consumed)) {
      subtractFromBag(user.stacks, material as MaterialType, amount)
    }
    for (const [material, amount] of Object.entries(result.produced)) {
      addToBag(user.stacks, material as MaterialType, amount)
      unitsProduced += amount
    }

    factory.lastHarvestTick += result.ticksRealized
    ticksRealized += result.ticksRealized
  }

  user.warehouseChoked = choked
  return { ticksRealized, choked, unitsProduced }
}

/**
 * 유저가 보유한 공장들의 레시피 원료별 **예비 보유량**을 계산한다.
 *
 * T2/T3 공장은 원료를 소비하므로 창고 재고를 전량 팔면 다음 접속까지 생산이
 * 멈춘다. 다음 접속 주기의 2배에 해당하는 소비량을 남겨 두는 것이 합리적
 * 플레이어의 행동이며, 이 예비량이 없으면 시뮬레이션이 T2/T3 경제를 전혀
 * 굴리지 못한다.
 *
 * 등급 배수는 의도적으로 반영하지 않는다 — 상한이 아니라 하한 예비량이면
 * 충분하고, 과다 예비는 판매를 막아 통화 발행을 인위적으로 눌러 버린다.
 *
 * @param user 대상 유저
 * @returns 자재 → 남겨 둘 수량
 */
export function computeReserves(user: MutableUser): Map<MaterialType, bigint> {
  const reserves = new Map<MaterialType, bigint>()
  const horizon = BigInt(Math.max(1, user.profile.sessionIntervalTicks) * 2)

  for (const factory of user.factories) {
    for (const req of getFactoryEntry(factory.type).recipe) {
      const need = req.amount * horizon
      reserves.set(req.material, (reserves.get(req.material) ?? 0n) + need)
    }
  }
  return reserves
}
