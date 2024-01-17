import BotClient from '@structures/BotClient'
import { Logger } from '@idle/utils'
import { RecurrenceRule, scheduleJob } from 'node-schedule'
import BaseManager from './BaseManager'
import { Stock } from '@prisma/client'

export default class ScheduleManager extends BaseManager {
  public logger = new Logger('ScheduleManager')

  constructor(client: BotClient) {
    super(client)
  }

  public async load() {
    const defaultRule: Partial<RecurrenceRule> = {
      tz: 'Asia/Seoul'
    }
    this.logger.info('Loading schedules...')

    this.logger.debug('Loading schedules...')

    this.client.schedules.set(
      'stockMarket.open',
      scheduleJob(
        'stockMarket.open',
        {
          ...defaultRule,
          rule: '0 16 * * *'
        },
        async () => {
          this.logger.debug('Stock market open!')
          return this.client.cache.set('stock', {
            status: 'open'
          })
        }
      )
    )

    this.client.schedules.set(
      'stockMarket.close',
      scheduleJob(
        'stockMarket.close',
        {
          ...defaultRule,
          rule: '0 22 * * *'
        },
        async () => {
          this.logger.debug('Stock market closed')

          return this.client.cache.set('stock', {
            status: 'closed',
            message:
              '주식 시장이 문을 닫았습니다. 오후 4부터 오후 10시 사이에 다시 오세요.'
          })
        }
      )
    )

    this.client.schedules.set(
      'stockMarket.refresh',
      scheduleJob(
        {
          ...defaultRule,
          rule: '0 * * * * *'
        },
        async () => {
          if (this.client.cache.get('stock')?.status === 'closed') return

          const stocks = await this.client.db.stock.findMany()

          const updatedStocks: Stock[] = stocks.map((stock) => ({
            ...stock,
            currentPrice: stock.nextPrice
          }))

          return this.client.db.stock
            .updateMany({
              data: updatedStocks,
              where: { id: { in: stocks.map((stock) => stock.id) } }
            })
            .then((payload) => {
              this.logger.debug(`Updated stock data count: ${payload.count}`)
              return payload
            })
        }
      )
    )
  }
}
