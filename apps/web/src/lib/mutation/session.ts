/**
 * 뮤테이션용 세션 가드.
 *
 * ## 페이지 가드와 다른 점
 *
 * 페이지(`dashboard/me/page.tsx` 등)는 미인증 시 `redirect('/login')` 하면 된다.
 * 뮤테이션은 그럴 수 없다 — `redirect` 는 throw 로 동작해 `useActionState` 의
 * 상태 갱신을 건너뛰고, 클라이언트 섬이 실패 사유를 표시할 기회를 없앤다.
 * 그래서 여기서는 실패를 **값**({@link MutationFailure})으로 돌려준다.
 *
 * ## 액션마다 다시 검사해야 하는 이유
 *
 * Next.js 문서가 명시하듯 **페이지 수준 인증 검사는 Server Action 으로 확장되지
 * 않는다.** 액션 하나하나가 독립된 공개 엔드포인트이므로, 그 액션을 띄운 페이지가
 * 무엇을 검사했든 무관하게 매번 세션을 다시 해석해야 한다.
 */

import { headers } from 'next/headers'
import { auth } from '../auth'
import { db } from '../db'
import { resolveGameUserId } from '../game-user'
import { infraFail, type MutationFailure } from './result'

/** 해석된 게임 세션. */
export interface GameSession {
  /** better-auth `AuthUser.id`. */
  readonly authUserId: string
  /** 게임 `User.id`(= Discord snowflake). */
  readonly gameUserId: string
  /** 약관·개인정보 동의를 모두 마쳤는가. */
  readonly consented: boolean
}

/** {@link requireGameUser} 옵션. */
export interface RequireGameUserOptions {
  /**
   * 동의 여부를 강제할지. 기본 `true`.
   *
   * 봇은 온보딩 precondition 으로 미동의 유저의 명령을 차단한다. 웹 쓰기도
   * 같은 정책을 따르지 않으면 디스코드에서 거부당한 유저가 웹으로 우회할 수 있다.
   */
  readonly requireConsent?: boolean
}

/**
 * 세션 → 게임 유저를 해석하고, 뮤테이션을 수행할 자격이 있는지 확인한다.
 *
 * 실패는 throw 하지 않고 {@link MutationFailure} 로 반환한다. 호출 측은
 * `'ok' in result` 가 아니라 반환 타입의 판별로 분기하면 된다.
 *
 * 게임 계정이 없으면 **자동 생성하지 않는다.** 계정 생성은 봇의 온보딩 동의
 * 절차(약관·개인정보 stamp + 스타터 지급 + 튜토리얼 시드)를 거쳐야 하며,
 * 웹에서 행만 만들면 그 절차를 통째로 건너뛰게 된다.
 *
 * @param options 동의 강제 여부
 * @returns 해석된 세션 또는 실패
 */
export async function requireGameUser(
  options?: RequireGameUserOptions,
): Promise<GameSession | MutationFailure> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return infraFail('UNAUTHENTICATED')

  const gameUserId = await resolveGameUserId(session.user.id)
  if (!gameUserId) return infraFail('NO_GAME_ACCOUNT')

  const user = await db.user.findUnique({
    where: { id: gameUserId },
    select: { agreedTermsAt: true, agreedPrivacyAt: true },
  })
  // AuthAccount 는 있는데 게임 User 행이 없는 상태 — 계정 삭제 직후 등.
  if (!user) return infraFail('NO_GAME_ACCOUNT')

  const consented = user.agreedTermsAt !== null && user.agreedPrivacyAt !== null
  if (options?.requireConsent !== false && !consented) return infraFail('CONSENT_REQUIRED')

  return { authUserId: session.user.id, gameUserId, consented }
}

/**
 * 값이 실패인지 판별한다.
 *
 * {@link requireGameUser} 처럼 `T | MutationFailure` 를 돌려주는 함수의 결과를
 * 좁힐 때 쓴다.
 *
 * @param value 판별할 값
 */
export function isMutationFailure(value: unknown): value is MutationFailure {
  return (
    value !== null &&
    typeof value === 'object' &&
    'ok' in value &&
    (value as { ok: unknown }).ok === false
  )
}
