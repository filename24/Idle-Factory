import { Prisma, PrismaClient } from '@idle/database'

/**
 * 서비스 계층 에러 코드.
 *
 * - `MAX_LANDS`: 유저가 이미 최대 5개 토지를 보유 (docs/design/11-land.md).
 * - `LAND_ALREADY_EXISTS`: 구매하려는 index의 토지가 이미 존재.
 * - `INVALID_LAND_INDEX`: 구매 대상 index가 유효 범위(2..5)를 벗어났거나 연속성 조건 위반.
 */
export type ServiceErrorCode =
  | 'USER_NOT_FOUND'
  | 'INSUFFICIENT_MONEY'
  | 'INSUFFICIENT_MATERIAL'
  | 'SLOT_OCCUPIED'
  | 'OUT_OF_BOUNDS'
  | 'FACTORY_NOT_FOUND'
  | 'LEVEL_LOCKED'
  | 'MAX_GRADE'
  | 'WAREHOUSE_FULL'
  | 'MAX_LANDS'
  | 'LAND_ALREADY_EXISTS'
  | 'INVALID_LAND_INDEX'

export class ServiceError extends Error {
  public readonly code: ServiceErrorCode
  public readonly details?: unknown

  constructor(code: ServiceErrorCode, message?: string, details?: unknown) {
    super(message ?? code)
    this.name = 'ServiceError'
    this.code = code
    this.details = details
  }
}

export type Tx = Prisma.TransactionClient

export async function runInTx<T>(
  prisma: PrismaClient,
  fn: (tx: Tx) => Promise<T>
): Promise<T> {
  return prisma.$transaction(fn, {
    isolationLevel: 'Serializable'
  })
}
