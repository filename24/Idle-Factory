/* eslint-disable */

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()
async function main() {
  const guild = await prisma.guild.upsert({
    where: { id: '997780500510949396' },
    update: {},
    create: {
      id: '997780500510949396',
      name: '오늘도 평화로운 단지',
      flags: 1 << 2,
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
