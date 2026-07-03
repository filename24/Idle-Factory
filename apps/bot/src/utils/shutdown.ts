import { container } from '@sapphire/framework'
import type { Client } from 'discord.js'

/** 그레이스풀 셧다운을 트리거하는 프로세스 시그널. */
const SHUTDOWN_SIGNALS = ['SIGTERM', 'SIGINT'] as const

/**
 * 단일 종료 단계를 안전하게 실행한다.
 *
 * 한 단계(큐/DB/클라이언트)의 실패가 이후 단계를 막지 않도록 에러를 삼키고
 * 로그만 남긴다.
 *
 * @param label - 로그용 단계 이름
 * @param close - 종료 동작 (Promise 또는 undefined 반환)
 */
async function safelyClose(
  label: string,
  close: () => Promise<unknown> | undefined
): Promise<void> {
  try {
    await close()
  } catch (err) {
    container.logger.error(
      `[shutdown] failed to close ${label}: ${(err as Error).message}`
    )
  }
}

/**
 * BullMQ 워커·큐 → DB(Prisma+Redis) → Discord 클라이언트 순으로 닫는다.
 *
 * 시그널 핸들러와 분리해 단위 테스트가 가능하도록 export 한다. 각 단계는
 * 독립적으로 에러를 처리하므로 하나가 실패해도 나머지는 계속 진행한다.
 *
 * @param client - 종료할 Discord 클라이언트
 */
export async function gracefulShutdown(client: Client): Promise<void> {
  container.logger.warn('[shutdown] graceful shutdown initiated')
  await safelyClose('scheduled-tasks', () => container.tasks?.close())
  await safelyClose('database', () => container.db?.disconnect())
  await safelyClose('client', () => client.destroy())
  container.logger.info('[shutdown] graceful shutdown complete')
}

/**
 * SIGTERM/SIGINT 시그널에 그레이스풀 셧다운을 연결한다.
 *
 * 중복 시그널은 무시하고 종료 절차를 단 한 번만 수행한 뒤 프로세스를 종료한다.
 *
 * @param client - 종료할 Discord 클라이언트
 */
export function registerGracefulShutdown(client: Client): void {
  let handled = false
  for (const signal of SHUTDOWN_SIGNALS) {
    process.once(signal, () => {
      if (handled) return
      handled = true
      container.logger.warn(
        `[shutdown] received ${signal}, shutting down gracefully`
      )
      void gracefulShutdown(client).finally(() => process.exit(0))
    })
  }
}
