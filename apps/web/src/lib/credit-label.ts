import type { CreditTier } from '@idle/game-core'

/**
 * 신뢰도 구간(CreditTier)의 한국어 라벨.
 * 근거: docs/design/07-global-system.md §신뢰도 효과 (구간별).
 */
const CREDIT_TIER_LABEL: Record<CreditTier, string> = {
  RESTRICTED: '제한',
  LIMITED: '주의',
  NORMAL: '정상',
  TRUSTED: '신뢰',
  ELITE: '엘리트',
}

/** 신뢰도 구간 → 한국어 라벨. */
export function creditTierLabel(tier: CreditTier): string {
  return CREDIT_TIER_LABEL[tier]
}

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
