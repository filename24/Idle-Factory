/**
 * `defineGameMutation` — 뮤테이션 조립점.
 *
 * 모든 게임 쓰기가 지나는 단 하나의 통로다. 순서를 여기서 고정해 두면
 * 기능별 액션 파일은 "무엇을 하는가"만 적으면 되고, "누구인지 확인했는가 ·
 * 입력을 검증했는가 · 소유자인가"를 매번 다시 쓰다 빠뜨릴 일이 없다.
 *
 * 실행 순서(이 순서에 의미가 있다):
 *  1. 세션 해석 + 동의 확인 — 신원 없이는 아무것도 하지 않는다.
 *  2. 레이트 리밋 — 비싼 일(파싱·DB 왕복) 이전에 건다.
 *  3. 입력 파싱 — Server Action 인자는 공격자가 임의로 보낼 수 있다.
 *  4. 소유권 확인 — 파싱된 입력에서 리소스 id 를 뽑아야 하므로 3 뒤다.
 *  5. 본체 실행.
 *  6. 직렬화 + 재검증.
 *
 * 반환값은 절대 throw 하지 않는다({@link MutationResult} 참고).
 */

import { revalidatePath as nextRevalidatePath } from 'next/cache'
import type { DatabaseClient } from '@idle/database'
import { runInTx, type Tx } from '@idle/game-services'
import { db } from '../db'
import { toClient, type Serialized } from '../serialize'
import { mapServiceError } from './errors'
import { assertAllResourceOwners, ownershipClient, type OwnershipRequirement } from './ownership'
import { checkRateLimit, type RateLimitRule, type RateLimitStore } from './rate-limit'
import { infraFail, mutationOk, type MutationResult } from './result'
import { isMutationFailure, requireGameUser, type GameSession } from './session'

/** 뮤테이션 본체가 받는 실행 컨텍스트. */
export interface GameMutationContext {
  readonly session: GameSession
  /** Prisma 클라이언트. 단발 쓰기는 이걸로 충분하다. */
  readonly db: DatabaseClient
  /**
   * Serializable 격리 + P2034 재시도 트랜잭션.
   *
   * 여러 테이블을 함께 바꾸는 작업은 반드시 이걸 거쳐야 한다. 봇과 같은
   * `runInTx` 를 쓰므로 재시도·백오프 동작이 두 표면에서 동일하다.
   */
  readonly tx: <R>(fn: (tx: Tx) => Promise<R>) => Promise<R>
}

/** 테스트 주입용 의존성. */
export interface GameMutationDeps {
  readonly resolveSession?: typeof requireGameUser
  readonly store?: RateLimitStore
  readonly revalidatePath?: (path: string) => void
}

/** {@link defineGameMutation} 옵션. */
export interface GameMutationOptions<TInput, TOutput> {
  /** 로깅·레이트리밋 버킷 식별자. 예: `land.buy`. */
  readonly name: string
  /**
   * 입력 화이트리스트 검증. **필수다.**
   *
   * Server Action 인자는 클라이언트가 임의 값으로 호출할 수 있다. 선택 옵션으로
   * 두면 "이번엔 입력이 단순하니까" 하고 건너뛰게 되므로 계약으로 강제한다.
   * 던지면 `INVALID_INPUT` 으로 변환된다.
   */
  readonly parse: (raw: unknown) => TInput
  /** 레이트 리밋. 생략하면 걸지 않는다. */
  readonly rateLimit?: Omit<RateLimitRule, 'bucket'>
  /** 검사할 리소스 소유권. 파싱된 입력에서 id 를 뽑는다. */
  readonly ownership?: (input: TInput) => readonly OwnershipRequirement[]
  /** 동의 강제 여부. 기본 `true`. */
  readonly requireConsent?: boolean
  /** 성공 시 재검증할 경로. */
  readonly revalidate?: readonly string[]
  /** 뮤테이션 본체. */
  readonly run: (ctx: GameMutationContext, input: TInput) => Promise<TOutput>
  readonly deps?: GameMutationDeps
}

/**
 * 게임 뮤테이션을 만든다.
 *
 * 반환된 함수는 Server Action 본체로 그대로 쓸 수 있다. 어떤 경우에도
 * reject 하지 않고 {@link MutationResult} 를 돌려준다.
 *
 * @param options 뮤테이션 정의
 * @returns 원시 입력을 받아 결과 봉투를 돌려주는 함수
 */
export function defineGameMutation<TInput, TOutput>(
  options: GameMutationOptions<TInput, TOutput>,
): (raw: unknown) => Promise<MutationResult<Serialized<TOutput>>> {
  const resolveSession = options.deps?.resolveSession ?? requireGameUser
  const revalidate = options.deps?.revalidatePath ?? nextRevalidatePath

  return async function runGameMutation(raw) {
    // 1. 신원
    const session = await resolveSession({ requireConsent: options.requireConsent })
    if (isMutationFailure(session)) return session

    // 2. 레이트 리밋
    if (options.rateLimit) {
      const verdict = await checkRateLimit(
        { bucket: options.name, ...options.rateLimit },
        session.gameUserId,
        options.deps?.store,
      )
      if (!verdict.allowed) return infraFail('RATE_LIMITED')
    }

    // 3. 입력
    let input: TInput
    try {
      input = options.parse(raw)
    } catch {
      // 파서가 남긴 메시지는 내부 구조를 드러낼 수 있어 그대로 쓰지 않는다.
      return infraFail('INVALID_INPUT')
    }

    // 4. 소유권
    if (options.ownership) {
      const failure = await assertAllResourceOwners(
        ownershipClient(db),
        options.ownership(input),
        session.gameUserId,
      )
      if (failure) return failure
    }

    // 5. 실행
    let output: TOutput
    try {
      output = await options.run({ session, db, tx: (fn) => runInTx(db, fn) }, input)
    } catch (err) {
      // 예상치 못한 실패는 서버 로그에만 원문을 남긴다.
      const failure = mapServiceError(err)
      if (failure.code === 'INTERNAL') {
        console.error(`[mutation:${options.name}] 처리되지 않은 오류`, err)
      }
      return failure
    }

    // 6. 재검증 — 성공했을 때만.
    for (const path of options.revalidate ?? []) revalidate(path)

    return mutationOk(toClient(output))
  }
}
