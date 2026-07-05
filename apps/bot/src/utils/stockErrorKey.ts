/**
 * 주식 ServiceError → i18n 키 매핑 (#18, marketErrorKey.ts 패턴).
 *
 * 슬래시 커맨드(`/stock ipo|buy|sell|info`)가 공유하는 에러 변환기. `surface`
 * 인자로 발생 흐름을 구분해 동일 코드라도 흐름에 맞는 문구를 반환한다(예:
 * `INSUFFICIENT_MONEY` 는 buy 흐름에서만, `INVALID_QUANTITY` 는 buy/sell 공용).
 *
 * `STOCK_LISTING_CONDITION_NOT_MET` 은 `details.failures`(미달 조건 코드 목록)를
 * 조건별 안내 문장으로 펼쳐 하나의 메시지로 합친다.
 *
 * 참조: docs/design/08-stock.md §상장 조건·사기 방지, GitHub #18
 */

import type { TFunction } from '@sapphire/plugin-i18next'
import type { ListingConditionFailure } from '@idle/game-core'
import { ServiceError } from '../services/base'

/** 에러가 발생한 `/stock` 서브커맨드 흐름. */
export type StockSurface = 'ipo' | 'buy' | 'sell' | 'info'

/** 상장 조건 미달 코드의 안내 문장 i18n 키 매핑. */
const CONDITION_KEYS: Record<ListingConditionFailure, string> = {
  LEVEL: 'game:stock.ipo.error.condition.LEVEL',
  FACTORY_COUNT: 'game:stock.ipo.error.condition.FACTORY_COUNT',
  TOTAL_ASSETS: 'game:stock.ipo.error.condition.TOTAL_ASSETS',
  RECENT_30D_TRADES: 'game:stock.ipo.error.condition.RECENT_30D_TRADES'
}

/**
 * 주식 에러를 사람용 메시지로 변환한다. ServiceError 가 아니면 공용 unknown 키.
 *
 * @param err 서비스에서 throw 된 에러
 * @param surface 발생 흐름(ipo/buy/sell/info)
 * @param t i18next 번역 함수
 * @returns 사용자 노출용 한 줄 메시지
 */
export function resolveStockErrorMessage(
  err: unknown,
  surface: StockSurface,
  t: TFunction
): string {
  if (!(err instanceof ServiceError)) {
    return t('game:common.error.unknown')
  }

  switch (err.code) {
    // ── 공통 매매 가드 ─────────────────────────────────────────────
    case 'USER_NOT_FOUND':
      return t('game:common.error.userNotFound')
    case 'STOCK_NOT_FOUND':
      return t('game:stock.error.notFound')
    case 'STOCK_SELF_TRADE':
      return t('game:stock.error.selfTrade')
    case 'STOCK_LEVEL_GATE': {
      const det = (err.details ?? {}) as { level?: number; required?: number }
      return t('game:stock.error.levelGate', {
        level: det.level ?? 0,
        required: det.required ?? 0
      })
    }
    case 'STOCK_RATE_LIMITED': {
      const det = (err.details ?? {}) as { max?: number }
      return t('game:stock.error.rateLimited', { max: det.max ?? 0 })
    }
    case 'INVALID_QUANTITY':
      return t('game:stock.error.invalidQuantity')

    // ── IPO ────────────────────────────────────────────────────────
    case 'STOCK_IPO_PRICE_OUT_OF_RANGE':
      return t('game:stock.ipo.error.priceOutOfRange')
    case 'FACTORY_NOT_FOUND':
      return t('game:stock.ipo.error.factoryNotFound')
    case 'STOCK_ALREADY_LISTED':
      return t('game:stock.ipo.error.alreadyListed')
    case 'STOCK_LISTING_CONDITION_NOT_MET': {
      const det = (err.details ?? {}) as {
        failures?: readonly ListingConditionFailure[]
      }
      const failures = det.failures ?? []
      const lines = failures.map((f) => t(CONDITION_KEYS[f]))
      return t('game:stock.ipo.error.conditionNotMet', {
        failures: lines.join('\n')
      })
    }

    // ── 매수 ───────────────────────────────────────────────────────
    case 'STOCK_FLOAT_EXHAUSTED':
      return t('game:stock.buy.error.floatExhausted')
    case 'INSUFFICIENT_MONEY': {
      const det = (err.details ?? {}) as { required?: string; have?: string }
      return t('game:stock.buy.error.insufficientMoney', {
        required: det.required ?? '-',
        have: det.have ?? '-'
      })
    }

    // ── 매도 ───────────────────────────────────────────────────────
    case 'STOCK_INSUFFICIENT_SHARES': {
      const det = (err.details ?? {}) as { requested?: number; have?: number }
      return t('game:stock.sell.error.insufficientShares', {
        requested: det.requested ?? 0,
        have: det.have ?? 0
      })
    }

    default:
      return t('game:common.error.unknown')
  }
}
