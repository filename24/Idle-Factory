import { db } from './db'

/**
 * better-auth 로그인 세션(AuthUser.id)을 게임 User.id(Discord snowflake)로 해석한다.
 *
 * 게임 계정과 웹 인증 계정은 분리되어 있고, 둘을 잇는 유일한 다리는
 * `AuthAccount`(providerId="discord")의 `accountId`(= Discord snowflake = 게임 User.id)다.
 * 연결 계정이 없거나(예: 게임을 한 번도 시작하지 않은 경우) null 을 반환한다.
 *
 * @param authUserId better-auth 세션의 user.id
 * @returns 게임 User.id 또는 null
 */
export async function resolveGameUserId(authUserId: string): Promise<string | null> {
  if (!authUserId) return null
  const account = await db.authAccount.findFirst({
    where: { userId: authUserId, providerId: 'discord' },
    select: { accountId: true },
  })
  return account?.accountId ?? null
}
