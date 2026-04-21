import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { MaterialType, PrismaClient } from '../src/generated/client.js'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

/**
 * 글로벌 마켓 기준가 (docs/design/00-onboarding.md — 자재 기준가 섹션)
 *
 * 경제 시스템 검증 기반값. 직구매 가격/업그레이드 비용/마켓 상하한이 모두 이 값에서 파생된다.
 * 스키마 변경이 아닌 기준가 조정은 reseed로 반영되도록 upsert가 basePrice/currentPrice를 덮어쓴다.
 */
const MARKET_BASE_PRICES: Record<MaterialType, bigint> = {
  // T1 — 원자재
  GRAIN: 10n,
  ORE: 20n,
  WOOD: 15n,
  CRUDE_OIL: 50n,
  // T2 — 가공재
  STEEL: 50n,
  FUEL: 80n,
  PLASTIC: 60n,
  PROCESSED_FOOD: 25n,
  FURNITURE: 60n,
  // T3 — 완제품
  CAR: 500n,
  ELECTRONIC: 800n,
  FINISHED_FOOD: 150n,
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
        update: { basePrice, currentPrice: basePrice },
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
