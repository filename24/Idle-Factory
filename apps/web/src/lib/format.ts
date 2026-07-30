/**
 * 숫자·통화·비율 포맷 유틸 (서버/클라이언트 공용, 의존성 없음).
 *
 * BigInt 자산·XP 값은 라우트 핸들러/RSC 경계에서 문자열로 직렬화되므로
 * 여기서는 `bigint | number | string` 을 모두 관대하게 받아 안전하게 처리한다.
 * 그룹 구분은 ICU 로케일 차이에 의한 SSR 하이드레이션 불일치를 피하려고
 * `toLocaleString` 대신 결정적 정규식 그룹핑으로 구현한다.
 */

/** 정수 문자열만 허용하는 방어적 파서 — 형식이 어긋나면 0n. */
function toBig(value: bigint | number | string): bigint {
  if (typeof value === 'bigint') return value
  if (typeof value === 'number') {
    return Number.isFinite(value) ? BigInt(Math.trunc(value)) : 0n
  }
  const s = String(value).trim()
  if (!/^-?\d+$/.test(s)) return 0n
  return BigInt(s)
}

/** 천 단위 콤마 그룹핑 (부호 유지). */
function groupDigits(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/**
 * 천 단위 구분 정수 포맷 (예: 12345678 → "12,345,678").
 * @param value 정수 값 (bigint/number/string)
 */
export function formatInt(value: bigint | number | string): string {
  const n = toBig(value)
  const neg = n < 0n
  const abs = neg ? -n : n
  return `${neg ? '-' : ''}${groupDigits(abs.toString())}`
}

/** 영어 압축 표기 단위 테이블 (큰 단위 우선). */
const COMPACT_UNITS_EN: ReadonlyArray<readonly [bigint, string]> = [
  [10n ** 12n, 'T'],
  [10n ** 9n, 'B'],
  [10n ** 6n, 'M'],
  [10n ** 3n, 'K'],
]

/** 주어진 단위 테이블로 압축 표기한다. 최상위 단위 + 소수 1자리. */
function compactWith(
  value: bigint | number | string,
  units: ReadonlyArray<readonly [bigint, string]>,
): string {
  const n = toBig(value)
  const neg = n < 0n
  const abs = neg ? -n : n
  const sign = neg ? '-' : ''
  for (const [unit, label] of units) {
    if (abs >= unit) {
      const whole = abs / unit
      const frac = ((abs % unit) * 10n) / unit
      const wholeStr = groupDigits(whole.toString())
      const body = frac > 0n ? `${wholeStr}.${frac}` : wholeStr
      return `${sign}${body}${label}`
    }
  }
  return `${sign}${groupDigits(abs.toString())}`
}

/** 억/만 압축 표기용 단위 테이블 (큰 단위 우선). */
const COMPACT_UNITS: ReadonlyArray<readonly [bigint, string]> = [
  [10n ** 12n, '조'],
  [10n ** 8n, '억'],
  [10n ** 4n, '만'],
]

/**
 * 한국어 압축 표기 — 최상위 단위 + 소수 1자리 (통계 타일용).
 *
 * 예: 123,456,789 → "1.2억", 12,345 → "1.2만", 9,999 → "9,999".
 * 만 미만은 콤마 그룹핑된 원값을 그대로 반환한다.
 *
 * @param value 정수 값
 */
export function formatKoreanCompact(value: bigint | number | string): string {
  return compactWith(value, COMPACT_UNITS)
}

/**
 * 로케일에 맞는 압축 표기.
 *
 * 한국어는 만 단위(조/억/만), 영어는 천 단위(K/M/B/T)로 자릿수를 끊는다.
 * 같은 값을 같은 단위로 보여주면 어느 한쪽 독자에게는 읽히지 않으므로 분기한다.
 *
 * @param value 정수 값
 * @param locale 표시 로케일
 */
export function formatCompact(value: bigint | number | string, locale: 'ko' | 'en'): string {
  return compactWith(value, locale === 'en' ? COMPACT_UNITS_EN : COMPACT_UNITS)
}

/**
 * 비율(0~1)을 백분율 문자열로 변환 (예: 0.05 → "5%").
 *
 * @param ratio 비율 (0~1 기준이나 임의 실수 허용)
 * @param digits 소수 자리수 (기본 0)
 */
export function formatPercent(ratio: number, digits = 0): string {
  if (!Number.isFinite(ratio)) return '0%'
  return `${(ratio * 100).toFixed(digits)}%`
}

/**
 * 순위 표기 — 한국어는 접미사(`1위`), 영어는 접두 해시(`#1`).
 *
 * @param rank 순위 (1-based)
 * @param locale 표시 로케일 (생략 시 한국어)
 */
export function formatRank(rank: number, locale: 'ko' | 'en' = 'ko'): string {
  return locale === 'en' ? `#${rank}` : `${rank}위`
}
