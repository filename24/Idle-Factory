import { PrismaPg } from '@prisma/adapter-pg'
import { Redis, RedisOptions } from 'ioredis'
import { Prisma, PrismaClient } from '../generated/client.js'

export class DatabaseClient extends PrismaClient {
  public redis!: Redis

  constructor(public options?: ClientOptions) {
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL!,
    })
    super({ adapter, ...options?.prisma })

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
    this.redis?.disconnect()

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
  prisma?: Omit<Prisma.PrismaClientOptions, 'adapter' | 'accelerateUrl'>
}

declare global {
  /* eslint-disable */
  var db: DatabaseClient | undefined
}
