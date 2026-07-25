/**
 * 시뮬레이션 전용 결정론적 난수 생성기.
 *
 * `market/price.ts` 의 `computeNextPrice` 는 노이즈를 **주입받는** 설계라
 * (호출자가 생성), 시뮬레이터도 자체 RNG 를 들고 있어야 한다. 재현성이
 * 목적이므로 `Math.random()` 은 쓰지 않는다 — 같은 시드는 항상 같은 리포트를
 * 만들어야 CI 회귀 게이트가 성립한다.
 *
 * 알고리즘은 mulberry32 — 32비트 상태의 단순 PRNG 로, 암호학적 안전성은 없지만
 * 균등분포 품질이 밸런스 시뮬레이션에 충분하고 구현이 짧아 감사하기 쉽다.
 */

/** 결정론적 난수원. 같은 시드로 만들면 같은 수열을 낸다. */
export interface Rng {
  /** `[0, 1)` 균등분포 실수 하나를 뽑고 상태를 전진시킨다. */
  next(): number
}

/** mulberry32 상태 전이 상수 — 원 논문 구현값. */
const MULBERRY_INCREMENT = 0x6d2b79f5

/**
 * 시드로부터 결정론적 RNG 를 만든다.
 *
 * @param seed 정수 시드 (같은 값 → 같은 수열)
 * @returns 난수원
 * @throws {RangeError} seed 가 유한수가 아닌 경우
 */
export function createRng(seed: number): Rng {
  if (!Number.isFinite(seed)) {
    throw new RangeError(`seed must be finite, got ${seed}`)
  }
  let state = seed >>> 0
  return {
    next(): number {
      state = (state + MULBERRY_INCREMENT) >>> 0
      let t = state
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
    },
  }
}

/**
 * `[-limit, +limit)` 범위의 대칭 노이즈를 뽑는다.
 *
 * `computeNextPrice` 의 `noise` 인자에 그대로 넣는 용도다
 * (docs/design/06-market.md §가격 산출 공식 "noise = Random(-0.20, +0.20)").
 *
 * @param rng 난수원
 * @param limit 절대값 상한 (>= 0). 예: 0.2 → ±20%
 * @returns 노이즈 비율
 * @throws {RangeError} limit 이 음수·비유한인 경우
 */
export function symmetricNoise(rng: Rng, limit: number): number {
  if (!Number.isFinite(limit) || limit < 0) {
    throw new RangeError(`limit must be a finite number >= 0, got ${limit}`)
  }
  return (rng.next() * 2 - 1) * limit
}
