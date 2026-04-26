import { DatabaseClient } from '@idle/database'

declare global {
  // eslint-disable-next-line no-var
  var _idleDb: InstanceType<typeof DatabaseClient> | undefined
}

/**
 * Next.js HMR/서버리스 환경에서 DatabaseClient 연결 누수 방지용 글로벌 싱글턴
 * 모든 RSC 및 라우트 핸들러는 이 인스턴스를 import해서 사용할 것
 */
export const db: DatabaseClient =
  globalThis._idleDb ?? (globalThis._idleDb = new DatabaseClient({ useRedis: false }))
