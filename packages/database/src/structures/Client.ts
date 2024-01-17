import { Logger } from '@idle/utils'
import { PrismaClient } from '@prisma/client'
import { Redis, RedisOptions } from 'ioredis'
import { PrismaClientOptions } from '@prisma/client/runtime/library'

export class DatabaseClient extends PrismaClient {
  private logger: Logger
  public redis: Redis

  constructor(public options: ClientOptions) {
    super()
    this.logger = new Logger('Database', { logPath: options.loggerPath })

    // @ts-ignore
    this.redis = new Redis(options.redis ?? process.env.REDIS_URL ?? 'redis://cache:6379')

    this.$connect().then(() => {
      this.logger.info('Connected to Prisma')
    })
  }

  public async disconnect() {
    this.logger.warn('Disconnecting Database...')

    this.$disconnect().then(() => this.logger.warn('Disconnected to Prisma'))
    this.redis.disconnect()

    return true
  }
}

export type ClientOptions = {
  /**
   * @default true
   */
  enableLogger?: boolean
  loggerPath?: string
} & DatabaseOptions

export interface DatabaseOptions {
  redis?: RedisOptions
  prisma?: PrismaClientOptions
}

declare global {
  /* eslint-disable */
  var db: DatabaseClient | undefined
}
