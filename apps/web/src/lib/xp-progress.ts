import { xpRequiredForLevel } from '@idle/game-core'

/** 레벨 내 XP 진행 상태 (표시용, 문자열 직렬화 전 순수 계산 결과). */
export interface XpProgressCalc {
  /** 다음 레벨 요구 XP. */
  readonly xpRequired: bigint
  /** 현재 레벨 내 누적 XP (입력 그대로). */
  readonly xpInLevel: bigint
  /** 진행률 0~100 (정수). */
  readonly xpPercent: number
}

/**
 * 레벨·레벨 내 XP 로 진행률을 계산하는 순수 함수.
 *
 * `User.xp` 는 "레벨 내 XP"(services/reward.ts §applyXp 규약)이며 분모는
 * `xpRequiredForLevel(level)`(docs/design/09-level-xp.md §XP 공식). 요구 XP 가 0 이면
 * (이론상 발생하지 않음) 0% 로 방어한다. 진행률은 0~100 으로 clamp 한다.
 *
 * @param level 현재 레벨 (>=1)
 * @param xpInLevel 현재 레벨 내 누적 XP (>=0)
 */
export function computeXpProgress(level: number, xpInLevel: bigint): XpProgressCalc {
  const xpRequired = xpRequiredForLevel(level)
  const xpPercent =
    xpRequired > 0n ? Math.max(0, Math.min(100, Number((xpInLevel * 100n) / xpRequired))) : 0
  return { xpRequired, xpInLevel, xpPercent }
}
