import { DatabaseClient } from '@idle/database'

const DEFAULT_DEV_URL =
  'postgresql://idle:idle@localhost:5433/idle-factory-dev?schema=public'

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = DEFAULT_DEV_URL
}

if (!/-dev(\?|$)/.test(process.env.DATABASE_URL)) {
  throw new Error(
    `[integration setup] Refusing to run: DATABASE_URL must target a *-dev database. Got: ${process.env.DATABASE_URL}`
  )
}

const TABLES = [
  'User',
  'Guild',
  'Land',
  'Slot',
  'Factory',
  'Worker',
  'Warehouse',
  'WarehouseStack',
  'GlobalMarketPrice',
  'MarketListing',
  'DailyPurchase',
  'Stock',
  'StockHolding',
  'StockPriceTick',
  'TradeLog',
  'WeeklySettlement',
  'InactiveServerPool',
  'Notice'
] as const

let client: DatabaseClient | null = null

export function getTestPrisma(): DatabaseClient {
  if (!client) {
    client = new DatabaseClient()
  }
  return client
}

export const testPrisma: DatabaseClient = getTestPrisma()

export async function resetDb(): Promise<void> {
  const prisma = getTestPrisma()
  const list = TABLES.map((t) => `"${t}"`).join(',')
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`
  )
}

export async function closeDb(): Promise<void> {
  if (client) {
    await client.$disconnect()
    client = null
  }
}
