/**
 * 공장 옵션 관련 순수 파싱·라벨 헬퍼.
 *
 * `/debug` 부스터 서브커맨드(set-booster/give-raw-booster)의 옵션 파싱과,
 * `/debug`·`/factory` 양쪽 autocomplete 가 공유하는 공장 선택 라벨 포맷을 담는다.
 * Sapphire/discord.js/DB 의존 없이 순수 입력 → 순수 출력이라 단위 테스트에서
 * 별칭·목 없이 그대로 로드된다 (`apps/bot/CLAUDE.md` §Testing 의 별칭 제약 회피).
 */

import type { UpgradeBooster } from '@idle/game-core'

/**
 * `set-booster` 의 "부스터 해제" 선택지 value 센티넬.
 * 슬래시 choice value 는 문자열만 허용하므로 `null` 대신 이 값을 쓴다.
 */
export const BOOSTER_OPTION_NONE = 'NONE'

/** `give-raw-booster` 의 기본 지급 수량(옵션 미입력 시). */
export const DEBUG_RAW_BOOSTER_DEFAULT_AMOUNT = 1

/** autocomplete 라벨에 노출할 공장 id 접미 길이(cuid 뒤 6자). */
const ID_SUFFIX_LENGTH = 6

/**
 * `set-booster` 의 `booster` 옵션 value 를 `Factory.upgradeBooster` 값으로 변환한다.
 *
 * 센티넬 `NONE` 은 부스터 해제(`null`)로, 그 외에는 `UpgradeBooster` 그대로 통과시킨다.
 * 슬래시 choice 로 값이 제약되므로 유효성 재검증은 하지 않는다(호출부 계약).
 *
 * @param value `set-booster` 의 `booster` 옵션 문자열
 * @returns 설정할 부스터, 해제면 `null`
 */
export function parseBoosterOption(value: string): UpgradeBooster | null {
  return value === BOOSTER_OPTION_NONE ? null : (value as UpgradeBooster)
}

/** `formatFactoryChoiceLabel` 입력 — 공장 요약 라벨 구성 필드. */
export interface FactoryChoiceLabelInput {
  /** 로컬라이즈된 공장 종류 라벨(예: "농장") */
  readonly typeLabel: string
  /** 현재 등급 */
  readonly grade: number
  /** 적용 중인 업그레이드 부스터(없으면 null) */
  readonly upgradeBooster: UpgradeBooster | null
  /** 원자재 부스터 투입 여부 */
  readonly hasRawBooster: boolean
  /** 공장 id(cuid) — 접미 6자만 라벨에 노출 */
  readonly id: string
}

/**
 * 공장 요약을 autocomplete 라벨 문자열로 만든다.
 *
 * `/factory`(upgrade/info/setmode/applybooster/destroy) 와 `/debug`(set-grade/
 * set-booster/advance-harvest/harvest-now) 의 `factory`·`factory_id` 자동완성이
 * 공유한다. 등급·부스터·원자재 투입 여부를 함께 보여 유저가 대상 공장을
 * cuid 없이 식별하게 한다.
 *
 * 형식: `{종류} G{등급} · {부스터|—}[ · 🧪] · #{id접미6}`.
 * 예) `농장 G3 · RARE · 🧪 · #ab12cd`, `광산 G1 · — · #ff00aa`.
 * 부스터는 raw enum 명(RARE/SPEED…)을 그대로 노출한다.
 *
 * @param input 라벨 구성 필드
 * @returns Discord autocomplete `name` 으로 쓸 문자열
 */
export function formatFactoryChoiceLabel(
  input: FactoryChoiceLabelInput
): string {
  const boosterText = input.upgradeBooster ?? '—'
  const rawText = input.hasRawBooster ? ' · 🧪' : ''
  const idSuffix = input.id.slice(-ID_SUFFIX_LENGTH)
  return `${input.typeLabel} G${input.grade} · ${boosterText}${rawText} · #${idSuffix}`
}
