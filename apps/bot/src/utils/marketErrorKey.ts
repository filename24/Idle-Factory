/**
 * 마켓 ServiceError → i18n 키 매핑.
 *
 * 슬래시 커맨드 (`/market buy|cancel|browse|list|sell|directbuy`) 와 인터랙션
 * 핸들러 (`market:buy:*`, `market:cancel:*`, `market:sell:*`, `market:dbuy:*`)
 * 가 같은 에러 매핑을 공유한다.
 *
 * `surface` 인자로 어느 흐름에서 발생한 에러인지 구분해 동일 코드라도 다른
 * 사용자 메시지를 반환할 수 있게 한다 (예: `LISTING_NOT_ACTIVE` 가 buy/cancel
 * 양쪽에서 다 발생, `PRICE_OUT_OF_RANGE` 가 list/buy 양쪽에서 다 발생).
 */

import type { TFunction } from '@sapphire/plugin-i18next'
import { ServiceError } from '../services/base'

export type MarketSurface = 'list' | 'buy' | 'cancel' | 'sell' | 'directbuy'

/**
 * 에러를 사람용 메시지로 변환한다. ServiceError 가 아니면 공용 unknown 키.
 */
export function resolveMarketErrorMessage(
  err: unknown,
  surface: MarketSurface,
  t: TFunction
): string {
  if (!(err instanceof ServiceError)) {
    return t('game:common.error.unknown')
  }

  switch (err.code) {
    case 'INVALID_QUANTITY':
      if (surface === 'directbuy') {
        return t('game:market.directbuy.error.invalidQuantity')
      }
      return surface === 'sell'
        ? t('game:market.sell.error.invalidQuantity')
        : t('game:market.list.error.invalidQuantity')
    // 자재 직구매 (#16, docs/design/04-economy.md §자재 직구매)
    case 'MATERIAL_NOT_DIRECT_BUYABLE':
      return t('game:market.directbuy.error.materialNotAllowed')
    case 'DAILY_LIMIT_EXCEEDED': {
      const det = (err.details ?? {}) as {
        limit?: number
        remaining?: number
      }
      return t('game:market.directbuy.error.dailyLimitExceededShort', {
        remaining: (det.remaining ?? 0).toLocaleString('en-US'),
        limit: (det.limit ?? 0).toLocaleString('en-US')
      })
    }
    case 'INVALID_PRICE':
      return t('game:market.list.error.invalidPrice')
    case 'INVALID_DURATION':
      return t('game:market.list.error.invalidDuration')
    case 'INSUFFICIENT_MATERIAL': {
      const det = (err.details ?? {}) as {
        required?: string
        have?: string
      }
      const key =
        surface === 'sell'
          ? 'game:market.sell.error.insufficientStock'
          : 'game:market.list.error.insufficientStock'
      return t(key, {
        required: det.required ?? '-',
        have: det.have ?? '-'
      })
    }
    case 'PRICE_OUT_OF_RANGE': {
      // 등록·구매 양쪽에서 발생 — 30분 변동으로 등록 후 밴드 이탈 가능 (#15).
      const det = (err.details ?? {}) as { min?: string; max?: string }
      const key =
        surface === 'buy'
          ? 'game:market.buy.error.priceOutOfRange'
          : 'game:market.list.error.priceOutOfRange'
      return t(key, {
        min: det.min ?? '-',
        max: det.max ?? '-'
      })
    }
    case 'PRICE_NOT_FOUND':
      return surface === 'directbuy'
        ? t('game:market.directbuy.error.priceNotFound')
        : t('game:market.sell.error.priceNotFound')
    case 'LISTING_NOT_FOUND':
      return surface === 'cancel'
        ? t('game:market.cancel.error.listingNotFound')
        : t('game:market.buy.error.listingNotFound')
    case 'LISTING_NOT_ACTIVE':
      return surface === 'cancel'
        ? t('game:market.cancel.error.listingNotActive')
        : t('game:market.buy.error.listingNotActive')
    case 'NOT_LISTING_OWNER':
      return t('game:market.cancel.error.notOwner')
    case 'SELF_PURCHASE':
      return t('game:market.buy.error.selfPurchase')
    case 'INSUFFICIENT_MONEY': {
      const det = (err.details ?? {}) as {
        required?: string
        have?: string
      }
      const key =
        surface === 'directbuy'
          ? 'game:market.directbuy.error.insufficientMoney'
          : 'game:market.buy.error.insufficientMoney'
      return t(key, {
        required: det.required ?? '-',
        have: det.have ?? '-'
      })
    }
    case 'USER_NOT_FOUND':
      return t('game:common.error.userNotFound')
    default:
      return t('game:common.error.unknown')
  }
}
