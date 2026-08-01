/**
 * 마켓·주식 표시용 순수 계산.
 *
 * DB 를 모르는 순수 함수만 둔다. `queries/*` 는 행을 읽어 여기에 넘기고,
 * 커버리지 게이트가 실제로 도는 곳은 이 파일이다.
 */

/** 1만분율(ppm) 기준 단위 — 100% = 10000. */
export const PPM_SCALE = 10_000

/**
 * 기준가 대비 등락을 1만분율 정수로 계산한다.
 *
 * 봇의 `MarketPriceService` 규약과 같은 단위를 쓴다. bigint 로 나눈 뒤
 * 마지막에만 `Number` 로 좁혀 큰 금액에서 정밀도를 잃지 않는다.
 *
 * @param current 현재가
 * @param base 기준가
 * @returns 등락 ppm. 기준가가 0 이하면 0
 */
export function changeFromBasePpm(current: bigint, base: bigint): number {
  if (base <= 0n) return 0
  return Number(((current - base) * BigInt(PPM_SCALE)) / base)
}

/**
 * 단가 × 수량으로 총액을 계산한다.
 *
 * `qty` 는 스키마상 `Int` 이고 `price` 는 `BigInt` 다. `Number` 로 곱하면
 * 2^53 을 넘는 순간 조용히 정밀도를 잃으므로 반드시 bigint 로 올려 곱한다.
 *
 * @param unitPrice 단가
 * @param qty 수량
 */
export function totalPrice(unitPrice: bigint, qty: number): bigint {
  if (!Number.isInteger(qty) || qty < 0) return 0n
  return unitPrice * BigInt(qty)
}

/**
 * 만료까지 남은 밀리초. 이미 지났으면 음수다.
 *
 * @param expiresAt 만료 시각
 * @param now 기준 시각
 */
export function msUntilExpiry(expiresAt: Date, now: Date): number {
  return expiresAt.getTime() - now.getTime()
}

/** 포트폴리오 한 종목의 손익 계산 입력. */
export interface PositionInput {
  readonly shares: number
  readonly avgBuyPrice: bigint
  readonly currentPrice: bigint
  readonly sharesOutstanding: number
}

/** 포트폴리오 한 종목의 손익 계산 결과. */
export interface PositionMath {
  readonly costBasis: bigint
  readonly marketValue: bigint
  readonly unrealizedPl: bigint
  readonly unrealizedPlPpm: number
  /** 발행 주수 대비 지분율 ppm. 발행 주수가 0이면 0. */
  readonly ownershipPpm: number
}

/**
 * 보유 종목의 평가액과 미실현 손익을 계산한다.
 *
 * @param input 보유 수량·평단가·현재가·발행 주수
 */
export function computePosition(input: PositionInput): PositionMath {
  const shares = BigInt(Math.max(0, Math.trunc(input.shares)))
  const costBasis = input.avgBuyPrice * shares
  const marketValue = input.currentPrice * shares
  const unrealizedPl = marketValue - costBasis

  return {
    costBasis,
    marketValue,
    unrealizedPl,
    unrealizedPlPpm: costBasis > 0n ? Number((unrealizedPl * BigInt(PPM_SCALE)) / costBasis) : 0,
    // 발행 주수 0 은 정상 데이터가 아니지만, 0으로 나누면 화면이 통째로 죽는다.
    ownershipPpm:
      input.sharesOutstanding > 0
        ? Math.round((input.shares / input.sharesOutstanding) * PPM_SCALE)
        : 0,
  }
}

/**
 * ppm 을 퍼센트 문자열로 만든다.
 *
 * `1234` → `"12.34%"`, `-500` → `"-5%"`, `0` → `"0%"`.
 * 불필요한 소수점 0 은 떼어 낸다.
 *
 * @param ppm 1만분율 정수
 * @param maxDigits 최대 소수 자릿수
 */
export function formatPpm(ppm: number, maxDigits = 2): string {
  if (!Number.isFinite(ppm)) return '0%'
  const percent = ppm / 100
  const fixed = percent.toFixed(maxDigits)
  // 소수부 뒤쪽 0 과 남은 소수점을 제거한다.
  const trimmed = fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed
  return `${trimmed}%`
}
