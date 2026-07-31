declare module '*.css'

/**
 * Prisma BigInt 직렬화 경계 규칙
 *
 * @idle/database 스키마의 BigInt 필드 (User.flag, Factory.flag, Factory.type,
 * Stock.price, Stock.latestPrice 등)는 RSC → Client Component 경계에서
 * JSON.stringify가 실패한다.
 *
 * 규칙: Client Component로 BigInt를 raw로 전달하지 말 것. BigInt는 number가
 * 아니라 **문자열**로 변환한다 — 금액 필드는 2^53을 넘길 수 있고 Number(bigint)는
 * 그 지점부터 조용히 정밀도를 잃는다. 필드별로 number/string을 저울질하는 대신
 * 하나의 규칙으로 통일한다.
 *
 * 두 가지 경로가 있다:
 *  - `src/lib/queries/*.ts` — DTO 필드를 손으로 `.toString()` 한다(기존 규약).
 *    반환 타입이 명시적이라 무엇이 문자열인지 시그니처에 드러난다.
 *  - `src/lib/serialize.ts`의 `toClient()` — 서비스 계층이 돌려준 임의 구조를
 *    재귀 변환한다. 뮤테이션 응답처럼 형태를 미리 못 박기 어려운 경로에 쓴다.
 *
 * 표시 측은 `src/lib/format.ts`의 `formatInt`/`formatCompact`가
 * `bigint | number | string`을 모두 받으므로 추가 비용이 없다.
 */
