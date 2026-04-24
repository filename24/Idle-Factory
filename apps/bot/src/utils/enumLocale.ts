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
