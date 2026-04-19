import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/client.js'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

async function main() {
  const guild = await prisma.guild.upsert({
    where: { id: '997780500510949396' },
    update: {},
    create: {
      id: '997780500510949396',
      name: '오늘도 평화로운 단지',
      flag: 1 << 2,
      tax: 0.1,
      lang: 'ko',
    },
  })
  console.log({ guild })
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
