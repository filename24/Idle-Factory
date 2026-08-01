/**
 * RSC → Client Component 경계 직렬화 헬퍼.
 *
 * Prisma 의 `BigInt` 와 `Date` 는 그대로 클라이언트 컴포넌트로 넘길 수 없다.
 * `BigInt` 는 `JSON.stringify` 가 `TypeError` 로 죽고, `Date` 는 넘어가긴 하지만
 * 서버 액션 응답에서는 문자열로 바뀌어 타입과 실제 값이 어긋난다.
 *
 * ## BigInt 는 number 가 아니라 **문자열**로 변환한다
 *
 * 게임의 금액 필드(`User.money`, `MarketListing.price`, 토지 구매가 등)는
 * 2^53 을 넘길 수 있고, `Number(bigint)` 는 그 지점부터 조용히 정밀도를 잃는다.
 * 잃은 정밀도는 화면에 "1,000,000,000,000,000,001 원" 대신 "…000" 으로 나타나
 * 버그로 인지되지도 않는다. 필드마다 number/string 을 저울질하는 대신 전부
 * 문자열로 통일한다 — `lib/format.ts` 의 `formatInt`·`formatCompact` 가
 * `bigint | number | string` 을 모두 받으므로 표시 측 비용은 없다.
 *
 * 이미 `queries/*.ts` 는 DTO 경계에서 손으로 `.toString()` 을 호출해 왔다
 * (`rankings.ts`, `guild-stats.ts`, `my-dashboard.ts`). 그 규약은 그대로 두고,
 * 이 헬퍼는 **서비스 계층이 돌려준 임의 구조**(중첩 객체·배열)를 한 번에
 * 정리해야 하는 뮤테이션 응답 경로를 위한 것이다.
 */

/** 직렬화 후 타입 — `bigint` 는 문자열로, `Date` 는 ISO 문자열로 좁혀진다. */
export type Serialized<T> = T extends bigint
  ? string
  : T extends Date
    ? string
    : T extends (infer U)[]
      ? Serialized<U>[]
      : T extends object
        ? { [K in keyof T]: Serialized<T[K]> }
        : T

/**
 * 값을 클라이언트로 넘길 수 있는 형태로 재귀 변환한다.
 *
 * - `bigint` → 10진 문자열
 * - `Date` → ISO 8601 문자열
 * - 배열·평범한 객체 → 각 원소를 재귀 변환한 **새 값**(입력은 변형하지 않는다)
 * - 그 외(`string`·`number`·`boolean`·`null`·`undefined`) → 그대로
 *
 * `Map`·`Set`·클래스 인스턴스는 대상이 아니다. 서비스 계층은 평범한 객체와
 * Prisma 행만 돌려주므로 실제로 등장하지 않으며, 넘어오면 열거 가능한 자기
 * 속성만 복사된 평범한 객체가 되어 조용히 뭉개진다. 그런 값을 경계 너머로
 * 보내려는 것 자체가 설계 실수라 별도 방어를 두지 않는다.
 *
 * @param value 직렬화할 값
 * @returns 구조는 같고 `bigint`·`Date` 만 문자열로 바뀐 새 값
 */
export function toClient<T>(value: T): Serialized<T> {
  return convert(value) as Serialized<T>
}

/** {@link toClient} 의 내부 재귀 구현 — 타입 단언을 한곳에 가둔다. */
function convert(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(convert)

  // null 은 typeof 가 'object' 라 먼저 걸러낸다.
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, inner] of Object.entries(value)) {
      out[key] = convert(inner)
    }
    return out
  }

  return value
}
