import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { resolveGameUserId } from '@/lib/game-user'
import { listOwnedLandIndices } from '@/lib/queries/my-land'

/**
 * `/dashboard/me/land` — 보유한 첫 토지로 넘긴다.
 *
 * 기본값을 1로 못 박지 않는 이유는, 토지 번호가 연속이라는 보장이 스키마에
 * 없기 때문이다. 실제로 보유한 최소 번호로 보내면 항상 유효한 화면이 뜬다.
 */
export default async function MyLandIndexPage(): Promise<never> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/login?callbackUrl=/dashboard/me/land')

  const gameUserId = await resolveGameUserId(session.user.id)
  if (!gameUserId) notFound()

  const owned = await listOwnedLandIndices(gameUserId)
  if (owned.length === 0) notFound()

  redirect(`/dashboard/me/land/${owned[0]}`)
}
