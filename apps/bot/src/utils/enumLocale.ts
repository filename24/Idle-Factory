/**
 * 게임 enum(공장 종류/자재/모드) → 현재 로케일 문자열 해석 헬퍼.
 *
 * 호출 측은 t() 에 interpolation 값을 넘기기 전에 이 헬퍼로 한 번 로컬라이즈해서
 * "FARM" / "PAUSE" / "GRAIN" 같은 raw enum 이 최종 문자열에 노출되지 않도록 한다.
 *
 * 키가 누락되면 defaultValue 로 enum 원문을 반환하므로 UI 가 깨지지는 않는다.
 */

import type { TFunction } from '@sapphire/plugin-i18next'
import type { FactoryType, MaterialType, ShortageMode } from '@idle/game-core'
import koGame from '../locales/ko/game.json'

/** `FARM` → "농장" / "Farm". */
export function localizeFactoryType(t: TFunction, type: FactoryType): string {
  return t(`game:factoryType.${type}`, { defaultValue: type })
}

/** `GRAIN` → "곡물" / "Grain". */
export function localizeMaterial(t: TFunction, material: MaterialType): string {
  return t(`game:material.${material}`, { defaultValue: material })
}

/** `PAUSE` → "일시 정지" / "Paused". */
export function localizeShortageMode(t: TFunction, mode: ShortageMode): string {
  return t(`game:shortageMode.${mode}`, { defaultValue: mode })
}

const KO_MATERIAL = koGame.material as Record<string, string | undefined>
const KO_FACTORY_TYPE = koGame.factoryType as Record<string, string | undefined>

/**
 * 슬래시 커맨드 choice 의 `name_localizations` 에 끼워 넣을 한국어 매핑.
 *
 * `t()` 를 사용할 수 없는 `registerApplicationCommands` 시점용이라 JSON 을
 * 직접 읽어 정적으로 매핑한다. ko 만 채우고 영어는 enum 그대로 노출한다.
 */
export function materialChoiceLocalizations(
  material: MaterialType
): { ko: string } | undefined {
  const ko = KO_MATERIAL[material]
  return ko ? { ko } : undefined
}

/** factoryType 슬래시 choice 한국어 라벨 매핑. */
export function factoryTypeChoiceLocalizations(
  type: FactoryType
): { ko: string } | undefined {
  const ko = KO_FACTORY_TYPE[type]
  return ko ? { ko } : undefined
}
