import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { MaterialType, PrismaClient } from '../src/generated/client.js'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

// 글로벌 마켓 기준가 (docs/06 — MVP 초기값, 런치 후 튜닝)
const MARKET_BASE_PRICES: Record<MaterialType, bigint> = {
  // T1
  GRAIN: 10n,
  ORE: 50n,
  WOOD: 15n,
  CRUDE_OIL: 100n,
  // T2
  STEEL: 200n,
  FUEL: 300n,
  PLASTIC: 400n,
  PROCESSED_FOOD: 50n,
  FURNITURE: 150n,
  // T3
  CAR: 10_000n,
  ELECTRONIC: 5_000n,
  FINISHED_FOOD: 200n,
  // 특수 — T3 저확률 드롭, 초고가
  RAW_BOOSTER: 1_000_000n,
}

async function main() {
  const guild = await prisma.guild.upsert({
    where: { id: '997780500510949396' },
    update: {},
    create: {
      id: '997780500510949396',
      name: '오늘도 평화로운 단지',
      flag: BigInt(1 << 2),
      taxSurcharge: 0.1,
      lang: 'ko',
    },
  })

  const prices = await Promise.all(
    Object.entries(MARKET_BASE_PRICES).map(([material, basePrice]) =>
      prisma.globalMarketPrice.upsert({
        where: { material: material as MaterialType },
        update: {},
        create: {
          material: material as MaterialType,
          basePrice,
          currentPrice: basePrice,
        },
      }),
    ),
  )

  console.log({ guild, priceCount: prices.length })
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
