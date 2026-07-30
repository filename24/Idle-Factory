import type { CreditTier } from '@idle/game-core'

// 구간 라벨은 `credit.tier.<TIER>` 메시지 키로 옮겼다(messages/<locale>.json).
// 근거: docs/design/07-global-system.md §신뢰도 효과 (구간별).

/**
 * 신뢰도 구간 → 디자인 토큰 시맨틱 색 클래스(텍스트).
 * 낮은 구간은 경고(빨강/주황), 높은 구간은 성공(초록/블루).
 */
const CREDIT_TIER_COLOR: Record<CreditTier, string> = {
  RESTRICTED: 'text-accent-red',
  LIMITED: 'text-accent-orange',
  NORMAL: 'text-body',
  TRUSTED: 'text-accent-green',
  ELITE: 'text-accent-blue',
}

/** 신뢰도 구간 → 텍스트 색 유틸리티 클래스. */
export function creditTierColorClass(tier: CreditTier): string {
  return CREDIT_TIER_COLOR[tier]
}
