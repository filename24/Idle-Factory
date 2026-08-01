import { QUEST_CATALOG, getQuestDef, type Reward } from '@idle/game-core'
import { QuestService } from '@idle/game-services'
import { db } from '../db'

/**
 * 내 퀘스트 조회 계층.
 *
 * `my-dashboard.ts` 는 상태별 **개수**만 집계한다(대시보드 StatTile 4개용).
 * 여기는 행 단위 상세라 카디널리티도, 갱신 주기도 다르다 — 네 개짜리 카운터를
 * 그리려고 매번 퀘스트 전체 행을 끌어오는 걸 피하려고 분리한다.
 *
 * 목록 조회는 `QuestService.listVisible` 을 그대로 쓴다. `status != CLAIMED`
 * 필터와 체인 순서 정렬을 웹에서 다시 구현하면 봇과 어긋날 수 있다.
 */

/** 웹 UI 에 노출되는 퀘스트 상태. CLAIMED 행은 목록에서 빠지므로 두 값뿐이다. */
export type QuestCardStatus = 'IN_PROGRESS' | 'COMPLETED'

/** 보상 한 줄. BigInt 는 RSC→Client 경계를 못 넘으므로 문자열로 내린다. */
export interface RewardLineDto {
  readonly kind: 'MONEY' | 'XP' | 'MATERIAL'
  readonly amount: string
  /** `MATERIAL` 일 때만. Prisma `MaterialType` enum 원문. */
  readonly material?: string
}

/** 체인 진행 표시(n/총) 메타. 단발성 퀘스트는 null. */
export interface QuestChainDto {
  readonly name: string
  readonly order: number
  readonly total: number
}

/** 퀘스트 카드 한 장. */
export interface QuestCardDto {
  readonly questId: string
  readonly status: QuestCardStatus
  /**
   * next-intl 메시지 키.
   *
   * 카탈로그는 i18next 네임스페이스가 붙은 `game:quest.…` 형태로 저장하는데,
   * next-intl 은 `:` 를 네임스페이스 구분자로 쓰지 않는다. {@link toWebMessageKey}
   * 로 접두를 떼어 낸 값이다.
   */
  readonly titleKey: string
  readonly descriptionKey: string
  readonly progress: string
  readonly target: string
  /** 진행률 0~100 정수. bigint 나눗셈으로 계산한다. */
  readonly percent: number
  readonly rewards: readonly RewardLineDto[]
  readonly chain: QuestChainDto | null
  /** [보상 받기] 활성 여부. */
  readonly claimable: boolean
}

/** 내 퀘스트 화면 전체 DTO. */
export interface MyQuestsDto {
  readonly quests: readonly QuestCardDto[]
  /** 수령 완료한 퀘스트 수. */
  readonly claimedCount: number
  /** 튜토리얼 체인 전체 길이 — 카탈로그에서 유도한다. */
  readonly tutorialTotal: number
  /** 튜토리얼을 전부 수령해 더 볼 퀘스트가 없는 상태인가. */
  readonly tutorialComplete: boolean
}

/**
 * i18next 카탈로그 키를 next-intl 키로 바꾼다.
 *
 * `'game:quest.tutorial.1.title'` → `'quest.tutorial.1.title'`.
 * 접두가 없으면 그대로 돌려준다.
 *
 * @param catalogKey 카탈로그에 저장된 i18n 키
 */
export function toWebMessageKey(catalogKey: string): string {
  const separator = catalogKey.indexOf(':')
  return separator === -1 ? catalogKey : catalogKey.slice(separator + 1)
}

/**
 * 진행률을 0~100 정수로 계산한다.
 *
 * `progress`·`target` 이 bigint 라 `Number` 로 먼저 바꾸면 큰 목표치에서
 * 정밀도를 잃는다. bigint 로 나눈 뒤 마지막에만 `Number` 로 좁힌다.
 *
 * @param progress 현재 진행도
 * @param target 완료 임계
 */
export function computeQuestPercent(progress: bigint, target: bigint): number {
  if (target <= 0n) return 100
  if (progress <= 0n) return 0
  if (progress >= target) return 100
  return Number((progress * 100n) / target)
}

/** 체인 이름이 같은 카탈로그 정의 수 — "n/5" 의 분모. */
function chainLength(chainName: string): number {
  return Object.values(QUEST_CATALOG).filter((def) => def.chain?.name === chainName).length
}

/** 카탈로그 보상을 DTO 로 바꾼다. */
function toRewardLine(reward: Reward): RewardLineDto {
  return reward.kind === 'MATERIAL'
    ? { kind: 'MATERIAL', amount: reward.amount.toString(), material: reward.material }
    : { kind: reward.kind, amount: reward.amount.toString() }
}

/**
 * 저장된 보상 스냅샷을 DTO 로 바꾼다.
 *
 * 시드 시점의 `UserQuest.rewardSnapshot` 을 쓰는 이유는, 카탈로그 보상이
 * 나중에 바뀌어도 유저가 시작할 때 약속된 보상이 유지되어야 하기 때문이다.
 * 스냅샷이 비었거나 형식이 어긋나면 카탈로그 정의로 폴백한다.
 *
 * @param snapshot `UserQuest.rewardSnapshot` (JSON)
 * @param fallback 카탈로그 정의의 보상
 */
function toRewardLines(snapshot: unknown, fallback: readonly Reward[]): RewardLineDto[] {
  if (!Array.isArray(snapshot)) return fallback.map(toRewardLine)

  const lines: RewardLineDto[] = []
  for (const entry of snapshot) {
    if (entry === null || typeof entry !== 'object') continue
    const { kind, amount, material } = entry as Record<string, unknown>
    if (kind !== 'MONEY' && kind !== 'XP' && kind !== 'MATERIAL') continue
    if (typeof amount !== 'string' && typeof amount !== 'number') continue

    lines.push(
      kind === 'MATERIAL' && typeof material === 'string'
        ? { kind, amount: String(amount), material }
        : { kind: kind === 'MATERIAL' ? 'MONEY' : kind, amount: String(amount) },
    )
  }
  return lines.length > 0 ? lines : fallback.map(toRewardLine)
}

/**
 * 게임 User.id 로 퀘스트 화면 데이터를 조립한다.
 *
 * @param gameUserId 게임 User.id (Discord snowflake)
 */
export async function getMyQuests(gameUserId: string): Promise<MyQuestsDto> {
  const [rows, claimedCount] = await Promise.all([
    QuestService.listVisible(db, gameUserId),
    db.userQuest.count({ where: { userId: gameUserId, status: 'CLAIMED' } }),
  ])

  const tutorialTotal = chainLength('tutorial')

  const quests: QuestCardDto[] = rows.flatMap((row) => {
    const def = getQuestDef(row.questId)
    // 카탈로그에서 사라진 정의는 건너뛴다 — 봇 서비스와 동일한 마이그레이션 안전장치.
    if (!def) return []

    const status: QuestCardStatus = row.status === 'COMPLETED' ? 'COMPLETED' : 'IN_PROGRESS'

    return [
      {
        questId: row.questId,
        status,
        titleKey: toWebMessageKey(def.title),
        descriptionKey: toWebMessageKey(def.description),
        progress: row.progress.toString(),
        target: row.target.toString(),
        percent: computeQuestPercent(row.progress, row.target),
        rewards: toRewardLines(row.rewardSnapshot, def.rewards),
        chain: def.chain
          ? {
              name: def.chain.name,
              order: def.chain.order,
              total: chainLength(def.chain.name),
            }
          : null,
        claimable: status === 'COMPLETED',
      },
    ]
  })

  return {
    quests,
    claimedCount,
    tutorialTotal,
    // 볼 퀘스트가 없고 수령 이력이 튜토리얼 전체 길이 이상이면 완주로 본다.
    tutorialComplete: quests.length === 0 && claimedCount >= tutorialTotal,
  }
}
