import { QUEST_CATALOG } from '@idle/game-core'
import { QuestService } from '@idle/game-services'
import { defineGameMutation } from '../mutation'
import { toWebMessageKey, type RewardLineDto } from '../queries/quests'

/**
 * 퀘스트 보상 수령 뮤테이션.
 *
 * 시스템 1 뮤테이션 인프라의 첫 실사용처다. 인증·레이트리밋·입력 검증·에러
 * 매핑을 전부 `defineGameMutation` 에 위임하고, 여기서는 도메인 호출만 한다.
 *
 * ## 소유권은 왜 `ownership` 옵션을 안 쓰는가
 *
 * `QuestService.claim` 은 복합 유니크 키 `userId_questId` 로 행을 찾는다.
 * `userId` 는 세션에서 유도한 값이고 클라이언트가 보낼 수 없으므로, 남의
 * 퀘스트 행에 도달하는 경로가 **구조적으로 존재하지 않는다**. 별도 소유권
 * 조회는 왕복만 늘릴 뿐 얻는 게 없다.
 *
 * ## 중복 클릭
 *
 * `claim` 은 이미 CLAIMED 인 행에 대해 빈 `grants` 를 돌려주는 멱등 no-op 이고,
 * `runInTx` 가 Serializable 격리 + P2034 재시도를 건다. 동시에 두 번 눌러도
 * 한쪽은 직렬화 실패로 재시도되며, 재시도 시점에는 이미 CLAIMED 라 no-op 분기를
 * 탄다. 지급은 정확히 한 번이다.
 */

/** 실제 지급된 보상 한 줄. */
export type ClaimedRewardLineDto = RewardLineDto

/** 이번 수령으로 새로 열린 퀘스트. */
export interface UnlockedQuestDto {
  readonly questId: string
  readonly titleKey: string
  readonly descriptionKey: string
}

/** 수령 성공 결과. */
export interface QuestClaimSuccess {
  readonly questId: string
  readonly grants: readonly ClaimedRewardLineDto[]
  /** 이미 수령한 상태였는가 — 중복 클릭 안내 분기용. */
  readonly alreadyClaimed: boolean
  readonly leveledUp: boolean
  readonly newLevel: number
  readonly unlocked: UnlockedQuestDto | null
}

/** 파싱된 입력. */
interface ClaimQuestInput {
  readonly questId: string
}

/**
 * 수령 요청 입력을 검증한다.
 *
 * 카탈로그에 없는 questId 는 DB 를 건드리기 **전에** 거부한다 — 임의 문자열로
 * 행 존재 여부를 떠보는 걸 막고, 불필요한 트랜잭션도 열지 않는다.
 *
 * @param raw Server Action 이 받은 원시 입력
 * @throws 검증 실패 시. 래퍼가 `INVALID_INPUT` 으로 변환한다.
 */
export function parseClaimQuestInput(raw: unknown): ClaimQuestInput {
  const questId =
    raw instanceof FormData
      ? raw.get('questId')
      : ((raw as { questId?: unknown } | null)?.questId ?? null)

  if (typeof questId !== 'string') throw new Error('questId 는 문자열이어야 한다')
  if (!(questId in QUEST_CATALOG)) throw new Error(`알 수 없는 questId: ${questId}`)

  return { questId }
}

/**
 * 퀘스트 보상을 수령한다.
 *
 * 성공 시 `/dashboard/me` 를 재검증한다 — 보상에 XP 가 포함되면 같은 페이지의
 * 레벨·XP 진행 바도 함께 바뀌기 때문이다.
 */
export const claimQuest = defineGameMutation({
  name: 'quest.claim',
  parse: parseClaimQuestInput,
  // 연타 방지용. 정확성은 서비스의 멱등 처리와 Serializable 격리가 담당한다.
  rateLimit: { limit: 20, windowMs: 60_000 },
  revalidate: ['/dashboard/me'],
  run: async (ctx, input): Promise<QuestClaimSuccess> => {
    const result = await ctx.tx((tx) =>
      QuestService.claim(tx, ctx.session.gameUserId, input.questId),
    )

    return {
      questId: input.questId,
      grants: result.grants.map((grant) =>
        grant.kind === 'MATERIAL'
          ? { kind: 'MATERIAL', amount: grant.amount.toString(), material: grant.material }
          : { kind: grant.kind, amount: grant.amount.toString() },
      ),
      // 서비스는 이미 CLAIMED 였을 때 빈 배열을 준다. 보상이 없는 퀘스트는
      // 카탈로그에 존재하지 않으므로 이 판정으로 충분하다.
      alreadyClaimed: result.grants.length === 0,
      leveledUp: result.leveledUp,
      newLevel: result.newLevel,
      unlocked: result.unlocked
        ? {
            questId: result.unlocked.questId,
            titleKey: toWebMessageKey(
              QUEST_CATALOG[result.unlocked.questId]?.title ?? result.unlocked.questId,
            ),
            descriptionKey: toWebMessageKey(
              QUEST_CATALOG[result.unlocked.questId]?.description ?? '',
            ),
          }
        : null,
    }
  },
})
