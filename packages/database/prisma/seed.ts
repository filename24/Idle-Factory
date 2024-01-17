import { PrismaClient, Prisma } from '@prisma/client'
import { faker } from '@faker-js/faker'
import { SnowflakeId } from '@idle/api-types'
const prisma = new PrismaClient()

const stockData: Prisma.StockCreateManyInput[] = []
for (let c = 0; c < Array(10).length; c++) {
  stockData.push({
    symbol: faker.string.alpha({
      casing: 'upper',
      length: 5,
    }),
    name: faker.company.name(),
    id: SnowflakeId.generate().toString(),
    currentPrice: faker.number.int(1000),
    nextPrice: faker.number.int(1000),
    quantity: faker.number.int(10000),
  })
}

async function main() {
  prisma.stock.createMany({
    data: stockData,
  })
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
