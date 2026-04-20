import { Prisma, PrismaClient } from '@idle/database'

export type ServiceErrorCode =
  | 'USER_NOT_FOUND'
  | 'INSUFFICIENT_MONEY'
  | 'INSUFFICIENT_MATERIAL'
  | 'SLOT_OCCUPIED'
  | 'SLOT_LOCKED'
  | 'OUT_OF_BOUNDS'
  | 'FACTORY_NOT_FOUND'
  | 'LEVEL_LOCKED'
  | 'MAX_GRADE'
  | 'WAREHOUSE_FULL'

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
