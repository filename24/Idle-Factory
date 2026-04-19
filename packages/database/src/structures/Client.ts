import { Prisma, PrismaClient } from '@prisma/client'
import { Redis, RedisOptions } from 'ioredis'

export class DatabaseClient extends PrismaClient {
  public redis!: Redis

  constructor(public options?: ClientOptions) {
    super(options?.prisma)

    if (options?.useRedis) {
      if (options?.redis) this.redis = new Redis(options.redis)
      else if (process.env.REDIS_URL) this.redis = new Redis(process.env.REDIS_URL)
    }

    this.$connect()
      .then(() => {
        console.info('Connected to Prisma')
      })
      .catch((err) => {
        console.error('Failed to connect to Prisma:', err)
      })
  }

  public async disconnect() {
    console.warn('Disconnecting Database...')

    this.$disconnect().then(() => console.warn('Disconnected to Prisma'))
    this.redis.disconnect()

    return true
  }
}

export type ClientOptions = {
  /**
   * @default false
   */
  useRedis?: boolean
} & DatabaseOptions

export interface DatabaseOptions {
  redis?: RedisOptions
  prisma?: Prisma.PrismaClientOptions
}

declare global {
  /* eslint-disable */
  var db: DatabaseClient | undefined
}
