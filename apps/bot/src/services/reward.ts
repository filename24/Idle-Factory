/**
 * 보상 지급 단일 진입점.
 *
 * 퀘스트 클레임뿐 아니라 미래 우편함·이벤트 보상까지 같은 경로로 흘려서
 * money/xp/material 변경 로직을 한 곳에서 검증한다.
 *
 * 모든 메서드는 외부에서 트랜잭션을 받아 그 안에서 실행한다 — 호출자(QuestService 등)가
 * 자기 게임 로직과 같은 원자성 단위로 묶기 위함.
 */

import { applyXp, type MaterialType, type Reward } from '@idle/game-core'
import { ServiceError, type Tx } from './base'

/**
 * 실제 지급된 보상 한 단위.
 * 입력 `Reward[]` 와 1:1 매칭되며 호출자(UI 렌더러)가 그대로 사용한다.
 */
export interface GrantedReward {
  readonly kind: 'MONEY' | 'XP' | 'MATERIAL'
  readonly amount: bigint
  readonly material?: MaterialType
}

/**
 * `RewardService.grant` 결과.
 * - `granted` : 지급된 보상 라인 — UI 표시·로깅용.
 * - `leveledUp` / `newLevel` : XP 지급으로 레벨업이 발생한 경우 갱신된 레벨.
 *   레벨업이 없거나 XP 보상이 없으면 `leveledUp=false`, `newLevel` 은 호출 전 레벨.
 */
export interface GrantResult {
  readonly granted: readonly GrantedReward[]
  readonly leveledUp: boolean
  readonly newLevel: number
}

/**
 * 한 트랜잭션 안에서 보상 배열을 일괄 지급한다.
 *
 * - `MONEY` → `User.money` 증가.
 * - `XP` → `applyXp` 거쳐 레벨업 같이 처리. `User.xp` (= xpInLevel) 와 `User.level` 모두 갱신.
 * - `MATERIAL` → `WarehouseStack` upsert.
 *
 * 빈 배열 입력 시 no-op (granted=[], leveledUp=false, newLevel=현재).
 *
 * @throws {ServiceError} 유저가 없거나 창고가 없을 때.
 */
export const RewardService = {
  async grant(
    tx: Tx,
    userId: string,
    rewards: readonly Reward[]
  ): Promise<GrantResult> {
    if (rewards.length === 0) {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { level: true }
      })
      if (!user) throw new ServiceError('USER_NOT_FOUND')
      return { granted: [], leveledUp: false, newLevel: user.level }
    }

    let moneyDelta = 0n
    let xpDelta = 0n
    const materialDeltas = new Map<MaterialType, bigint>()
    const granted: GrantedReward[] = []

    for (const r of rewards) {
      if (r.amount <= 0n) continue
      switch (r.kind) {
        case 'MONEY':
          moneyDelta += r.amount
          granted.push({ kind: 'MONEY', amount: r.amount })
          break
        case 'XP':
          xpDelta += r.amount
          granted.push({ kind: 'XP', amount: r.amount })
          break
        case 'MATERIAL': {
          const cur = materialDeltas.get(r.material) ?? 0n
          materialDeltas.set(r.material, cur + r.amount)
          granted.push({
            kind: 'MATERIAL',
            amount: r.amount,
            material: r.material
          })
          break
        }
      }
    }

    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { level: true, xp: true }
    })
    if (!user) throw new ServiceError('USER_NOT_FOUND')

    let newLevel = user.level
    let leveledUp = false

    if (moneyDelta > 0n || xpDelta > 0n) {
      const xpResult =
        xpDelta > 0n
          ? applyXp({ level: user.level, xpInLevel: user.xp }, xpDelta)
          : null

      await tx.user.update({
        where: { id: userId },
        data: {
          ...(moneyDelta > 0n ? { money: { increment: moneyDelta } } : {}),
          ...(xpResult
            ? {
                level: xpResult.progress.level,
                xp: xpResult.progress.xpInLevel
              }
            : {})
        }
      })

      if (xpResult) {
        newLevel = xpResult.progress.level
        leveledUp = xpResult.leveledUp
      }
    }

    if (materialDeltas.size > 0) {
      const warehouse = await tx.warehouse.findUnique({
        where: { userId },
        select: { id: true }
      })
      if (!warehouse) {
        throw new ServiceError(
          'USER_NOT_FOUND',
          `warehouse missing for user ${userId} (cannot grant material reward)`
        )
      }
      for (const [material, amount] of materialDeltas) {
        await tx.warehouseStack.upsert({
          where: {
            warehouseId_material: { warehouseId: warehouse.id, material }
          },
          create: { warehouseId: warehouse.id, material, count: amount },
          update: { count: { increment: amount } }
        })
      }
    }

    return { granted, leveledUp, newLevel }
  }
} as const
