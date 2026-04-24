declare module '*.css'

/**
 * Prisma BigInt 직렬화 경계 규칙
 *
 * @idle/database 스키마의 BigInt 필드 (User.flag, Factory.flag, Factory.type,
 * Stock.price, Stock.latestPrice 등)는 RSC → Client Component 경계에서
 * JSON.stringify가 실패한다.
 *
 * 규칙: Client Component로 BigInt를 raw로 전달하지 말 것.
 * 반드시 src/lib/serialize.ts의 serializeBigInt()를 통해 number로 변환 후 전달.
 * 금액(money)처럼 precision이 중요한 경우 String(bigint)으로 변환한다.
 */
