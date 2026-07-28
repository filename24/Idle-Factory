/** `registerRepeatedTasks` 의 결과. 호출부 로깅과 테스트에서 쓴다. */
export type RepeatedTaskRegistration = 'registered' | 'empty' | 'failed'

/** 등록에 필요한 최소 의존성. Sapphire container 를 직접 붙들지 않아 테스트가 쉽다. */
export interface RegisterRepeatedTasksDeps {
  /** `pattern`/`interval` 이 정의된 ScheduledTask 개수. */
  readonly repeatedCount: number
  /** `container.tasks.createRepeated()`. */
  readonly createRepeated: () => Promise<unknown>
  readonly logger: {
    info(message: string): void
    warn(message: string): void
    error(message: string): void
  }
}

/**
 * BullMQ 반복 작업을 Redis 에 등록한다.
 *
 * `@sapphire/plugin-scheduled-tasks` 는 ScheduledTask piece 에 `pattern` 이나
 * `interval` 이 있어도 **자동으로 스케줄하지 않는다.** `createRepeated()` 를 직접
 * 불러야 repeatable job 이 만들어진다. 이 호출이 없으면 task 는 store 에 로드만
 * 되고 영원히 실행되지 않는데, 에러도 경고도 남지 않아 "스케줄이 조용히 안 도는"
 * 상태가 된다(실제로 프로덕션에서 겪음).
 *
 * 재시작마다 호출해도 안전하다. BullMQ 는 (이름·패턴·타임존) 해시를 job key 로
 * 쓰므로 같은 정의를 다시 넣으면 덮어쓰기만 한다.
 *
 * ⚠️ 반대로 **패턴을 바꾸면 옛 job 이 자동으로 사라지지 않는다.** 새 key 가 생기고
 * 옛 key 도 남아 두 스케줄이 함께 돈다. cron 을 변경할 때는 Redis 의
 * `bull:scheduled-tasks:repeat:*` 를 확인해 옛 항목을 지울 것.
 *
 * 등록 실패는 던지지 않는다 — 봇의 나머지 기능은 스케줄러 없이도 동작해야 하므로
 * 로그만 남기고 넘어간다.
 */
export async function registerRepeatedTasks(
  deps: RegisterRepeatedTasksDeps
): Promise<RepeatedTaskRegistration> {
  const { repeatedCount, createRepeated, logger } = deps

  if (repeatedCount === 0) {
    logger.warn(
      '반복 스케줄이 정의된 ScheduledTask 가 없다 — build/scheduled-tasks 가 비었는지 확인할 것'
    )
    return 'empty'
  }

  try {
    await createRepeated()
    logger.info(`반복 작업 ${repeatedCount}개를 큐에 등록했다`)
    return 'registered'
  } catch (error) {
    logger.error(
      `반복 작업 등록 실패 (스케줄러가 돌지 않는다): ${(error as Error).message}`
    )
    return 'failed'
  }
}
