'use server'

/**
 * 내 대시보드 Server Action.
 *
 * 로직 본체는 `src/lib/mutations/*` 에 둔다 — `vitest.config.ts` 의 커버리지
 * 범위가 `src/lib/**` 라, 여기에 로직을 넣으면 검증 대상에서 조용히 빠진다.
 *
 * **재export(`export { x } from '…'`)로는 안 된다.** `'use server'` 모듈에서
 * 액션으로 인식되는 것은 이 파일이 직접 선언한 async 함수뿐이라, 재export 는
 * 타입체크는 통과하지만 번들 시점에 "The module has no exports at all" 로
 * 깨진다. 그래서 얇은 async 래퍼로 감싼다.
 */

import { claimQuest } from '@/lib/mutations/quest-claim'
import type { QuestClaimSuccess } from '@/lib/mutations/quest-claim'
import type { MutationResult } from '@/lib/mutation'

/**
 * 퀘스트 보상 수령.
 *
 * @param formData `questId` 필드를 담은 폼 데이터
 */
export async function claimQuestAction(
  formData: FormData,
): Promise<MutationResult<QuestClaimSuccess>> {
  return claimQuest(formData)
}
