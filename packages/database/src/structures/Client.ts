import { PrismaPg } from '@prisma/adapter-pg'
import { Redis, RedisOptions } from 'ioredis'
import { Pool, type PoolConfig } from 'pg'
import { Prisma, PrismaClient } from '../generated/client.js'

/**
 * 서버리스 환경(Vercel 등) 여부를 판단한다.
 *
 * 서버리스에서는 인스턴스마다 별도의 pg 풀이 생기므로 풀 크기를
 * 제한하지 않으면 DB 커넥션이 폭증해 타임아웃(P1008)을 유발하고,
 * 함수가 소켓 타임아웃까지 열려 있어 Function Duration 과금을 키운다.
 */
function isServerless(): boolean {
  return process.env.VERCEL === '1' || process.env.AWS_LAMBDA_FUNCTION_NAME !== undefined
}

/**
 * 숫자 환경 변수를 읽는다. 값이 없거나 유효하지 않으면 기본값을 반환한다.
 *
 * @param name 환경 변수 이름
 * @param fallback 기본값
 */
function readPoolNumber(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw.trim() === '') return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

/**
 * pg 풀 설정을 만든다.
 *
 * - `DB_POOL_MAX`: 풀 최대 커넥션 수. 기본값은 서버리스 1, 상시 프로세스(봇) 5.
 *   서버리스 인스턴스당 풀 하나이므로 1로 묶어야 커넥션 스톰을 막는다.
 * - `DB_POOL_CONNECTION_TIMEOUT_MS`: 커넥션 획득 대기 상한(기본 5000ms).
 * - `DB_POOL_IDLE_TIMEOUT_MS`: 유휴 커넥션 유지 시간(기본 10000ms).
 * - `DB_STATEMENT_TIMEOUT_MS`: 단일 쿼리 서버 측 취소 상한(기본 10000ms).
 *   장시간 대기 쿼리를 빨리 실패시켜 함수 실행 시간을 묶는다.
 */
function resolvePoolConfig(connectionString: string): PoolConfig {
  const fallbackMax = isServerless() ? 1 : 5
  return {
    connectionString,
    max: readPoolNumber('DB_POOL_MAX', fallbackMax),
    connectionTimeoutMillis: readPoolNumber('DB_POOL_CONNECTION_TIMEOUT_MS', 5_000),
    idleTimeoutMillis: readPoolNumber('DB_POOL_IDLE_TIMEOUT_MS', 10_000),
    statement_timeout: readPoolNumber('DB_STATEMENT_TIMEOUT_MS', 10_000),
  }
}

export class DatabaseClient extends PrismaClient {
  public redis!: Redis

  constructor(public options?: ClientOptions) {
    const adapter = new PrismaPg(new Pool(resolvePoolConfig(process.env.DATABASE_URL!)), {
      disposeExternalPool: true,
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
