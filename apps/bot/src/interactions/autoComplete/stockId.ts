import { Logger } from '@idle/utils'
import { AutoComplete } from '@structures/Interaction'
import { ApplicationCommandOptionChoiceData } from 'discord.js'

const logger = new Logger('AutoComplete', {
  logPath: '../../../logs/latest.log'
}).getSubLogger({
  name: 'stockId'
})
export default new AutoComplete('stock_name', async (client, interaction) => {
  logger.debug(`Requested user ${interaction.user.username}`)

  logger.debug(`Fetching stock data...`)

  const stocks = await client.db.stock.findMany({
    select: {
      name: true,
      symbol: true
    }
  })

  logger.debug(
    `Fetched ${stocks.length} stocks ${stocks.map((d) => d.symbol + ', ')}`
  )

  const stockResponce: ApplicationCommandOptionChoiceData[] = []

  stocks.map((data) =>
    stockResponce.push({
      name: `${data.name}(${data.symbol})`,
      value: data.symbol
    })
  )

  await interaction.respond(stockResponce)
})
