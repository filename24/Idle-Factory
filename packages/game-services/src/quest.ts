/**
 * 퀘스트 서비스.
 *
 * (1) 카탈로그(`@idle/game-core/quests`) 의 정의를 시드해 `UserQuest` 행을 만들고,
 * (2) 게임 이벤트로 진행도를 갱신하고,
 * (3) [보상 받기] 클릭 시 보상을 지급한다.
 *
 * 모든 mutation 메서드는 호출자가 외부에서 시작한 트랜잭션을 그대로 사용한다.
 * 게임 서비스가 자기 트랜잭션 안에서 `progress` 를 호출해도 같은 원자성을 보장.
 *
 * 참조: docs/design/00-onboarding.md §튜토리얼 퀘스트 체인
 */

import type { PrismaClient, UserQuest } from '@idle/database'
import {
  getNextInChain,
  getQuestDef,
  matchEvent,
  QUEST_CATALOG,
  type QuestDef,
  type QuestEvent,
  type Reward,
} from '@idle/game-core'
import { ServiceError, type Tx } from './base'
import { RewardService, type GrantedReward } from './reward'

/** 신규 유저에게 시드되는 첫 튜토리얼 노드. */
export const TUTORIAL_ENTRY_QUEST_ID = 'tutorial.1'

/**
 * `QuestService.progress` 결과.
 * - `newlyCompleted` : 이번 호출로 새로 COMPLETED 된 행 (이전엔 IN_PROGRESS 였던 것만).
 *   COMPLETED 행은 클레임 전까지 그대로 남아 `/quest` 에서 [보상 받기] 버튼으로 노출된다.
 */
export interface QuestProgressResult {
  readonly newlyCompleted: readonly UserQuest[]
}

/**
 * `QuestService.claim` 결과.
 * - `claimed` : 이번 호출로 CLAIMED 가 된 행 (또는 이미 CLAIMED 였다면 멱등 no-op 후 그 행).
 * - `grants` : 실제 지급된 보상 라인 (UI 노출용). 이미 CLAIMED 였다면 빈 배열.
 * - `unlocked` : 이번 클레임으로 chain.next 가 새로 시드된 행. 단발성 퀘스트나 종착 노드는 null.
 * - `leveledUp` / `newLevel` : XP 보상으로 레벨업이 발생했을 때.
 */
export interface QuestClaimResult {
  readonly claimed: UserQuest
  readonly grants: readonly GrantedReward[]
  readonly unlocked: UserQuest | null
  readonly leveledUp: boolean
  readonly newLevel: number
}

function getDefOrThrow(questId: string): QuestDef {
  const def = getQuestDef(questId)
  if (!def) {
    throw new ServiceError('QUEST_NOT_FOUND', `unknown questId in catalog: ${questId}`)
  }
  return def
}

/**
 * Reward 배열을 JSON 직렬화 가능한 형태로 스냅샷한다.
 * Prisma `Json` 컬럼은 `bigint` 를 직접 저장 못 하므로 amount 를 string 으로 변환.
 */
function serializeRewards(rewards: readonly Reward[]): unknown {
  return rewards.map((r) => {
    if (r.kind === 'MATERIAL') {
      return { kind: r.kind, amount: r.amount.toString(), material: r.material }
    }
    return { kind: r.kind, amount: r.amount.toString() }
  })
}

/**
 * 행에 박힌 rewardSnapshot 을 다시 `Reward[]` 로 복원한다.
 * 정의가 카탈로그에서 변경되어도 시드 시점의 보상이 결정적으로 지급되도록 보장.
 */
function deserializeRewards(snapshot: unknown): Reward[] {
  if (!Array.isArray(snapshot)) return []
  return snapshot.map((raw) => {
    const r = raw as { kind: string; amount: string; material?: string }
    if (r.kind === 'MATERIAL') {
      return {
        kind: 'MATERIAL',
        amount: BigInt(r.amount),
        material: r.material as Reward extends { material: infer M } ? M : never,
      } as Reward
    }
    if (r.kind === 'XP') return { kind: 'XP', amount: BigInt(r.amount) }
    return { kind: 'MONEY', amount: BigInt(r.amount) }
  })
}

/**
 * 카탈로그 정의로 새 `UserQuest` 행을 만들거나 이미 있으면 그대로 반환.
 * `target` 과 `rewardSnapshot` 을 시드 시점에 박는다.
 */
async function upsertSeed(tx: Tx, userId: string, def: QuestDef): Promise<UserQuest> {
  return tx.userQuest.upsert({
    where: { userId_questId: { userId, questId: def.id } },
    create: {
      userId,
      questId: def.id,
      kind: def.kind,
      target: def.target,
      rewardSnapshot: serializeRewards(def.rewards) as never,
    },
    update: {},
  })
}

export const QuestService = {
  /**
   * `/quest` UI 에 노출할 퀘스트 목록.
   * - status != CLAIMED 인 행만 (CLAIMED 는 보관·집계용일 뿐 UI 에 안 보여준다).
   * - 정렬: TUTORIAL chain.order 우선, 그 외는 createdAt asc.
   */
  async listVisible(prisma: PrismaClient, userId: string): Promise<UserQuest[]> {
    const rows = await prisma.userQuest.findMany({
      where: { userId, status: { not: 'CLAIMED' } },
      orderBy: { createdAt: 'asc' },
    })
    return rows.sort((a, b) => {
      const da = getQuestDef(a.questId)
      const db = getQuestDef(b.questId)
      const oa = da?.chain?.order ?? Number.MAX_SAFE_INTEGER
      const ob = db?.chain?.order ?? Number.MAX_SAFE_INTEGER
      return oa - ob
    })
  },

  /**
   * 신규 유저(가입 직후) 또는 튜토리얼 진입 시점에 호출.
   * 첫 튜토리얼 노드를 IN_PROGRESS 로 upsert. 멱등.
   */
  async seedTutorial(tx: Tx, userId: string): Promise<UserQuest> {
    const def = getDefOrThrow(TUTORIAL_ENTRY_QUEST_ID)
    return upsertSeed(tx, userId, def)
  },

  /**
   * 게임 이벤트를 받아 IN_PROGRESS 행들의 진행도를 갱신한다.
   *
   * - 매칭 정의 — 카탈로그 일치 + `matchEvent` 통과.
   * - 진행도 누적 — `progress + increment` 가 `target` 이상이면 COMPLETED 로 전환.
   *   COMPLETED 시 클레임은 자동 발생하지 않는다 ([보상 받기] 버튼으로 수동 클레임).
   * - 트리거 미매치 시 변화 없음.
   *
   * 같은 트랜잭션 안에서 호출되므로 게임 상태와 원자적.
   * Serializable 격리 덕분에 동일 유저의 동시 이벤트도 progress 중복 가산이 발생하지 않는다.
   */
  async progress(tx: Tx, userId: string, event: QuestEvent): Promise<QuestProgressResult> {
    const active = await tx.userQuest.findMany({
      where: { userId, status: 'IN_PROGRESS' },
    })
    if (active.length === 0) return { newlyCompleted: [] }

    const newlyCompleted: UserQuest[] = []

    for (const row of active) {
      const def = getQuestDef(row.questId)
      if (!def) continue // 카탈로그에서 사라진 정의는 무시 (마이그레이션 안전성)

      const m = matchEvent(def, event)
      if (!m.matched || m.increment <= 0n) continue

      const nextProgress = row.progress + m.increment
      if (nextProgress >= row.target) {
        const completed = await tx.userQuest.update({
          where: { id: row.id },
          data: {
            progress: row.target,
            status: 'COMPLETED',
            completedAt: new Date(),
          },
        })
        newlyCompleted.push(completed)
      } else {
        await tx.userQuest.update({
          where: { id: row.id },
          data: { progress: nextProgress },
        })
      }
    }

    return { newlyCompleted }
  },

  /**
   * 수동 클레임. status=COMPLETED 행만 처리.
   *
   * 흐름:
   * 1. 행 잠금(`findUnique`) → status 검사.
   * 2. `RewardService.grant(tx, userId, rewardSnapshot)` 로 보상 지급.
   * 3. status=CLAIMED + claimedAt 갱신.
   * 4. 카탈로그의 `chain.next` 가 있으면 다음 노드를 IN_PROGRESS 로 시드.
   *
   * 멱등: 이미 CLAIMED 행에 대해 호출 시 `grants=[]`, `unlocked=null` 로 no-op.
   *
   * @throws {ServiceError} `QUEST_NOT_FOUND` (행 없음), `QUEST_NOT_COMPLETED` (아직 미완료).
   */
  async claim(tx: Tx, userId: string, questId: string): Promise<QuestClaimResult> {
    const row = await tx.userQuest.findUnique({
      where: { userId_questId: { userId, questId } },
    })
    if (!row) {
      throw new ServiceError('QUEST_NOT_FOUND', `UserQuest not found: ${userId}/${questId}`)
    }

    if (row.status === 'CLAIMED') {
      // 멱등 no-op.
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { level: true },
      })
      return {
        claimed: row,
        grants: [],
        unlocked: null,
        leveledUp: false,
        newLevel: user?.level ?? 1,
      }
    }
    if (row.status !== 'COMPLETED') {
      throw new ServiceError('QUEST_NOT_COMPLETED', `quest ${questId} is still in progress`)
    }

    const rewards = deserializeRewards(row.rewardSnapshot)
    const grant = await RewardService.grant(tx, userId, rewards)

    const claimed = await tx.userQuest.update({
      where: { id: row.id },
      data: { status: 'CLAIMED', claimedAt: new Date() },
    })

    let unlocked: UserQuest | null = null
    const def = getQuestDef(questId)
    if (def) {
      const nextDef = getNextInChain(QUEST_CATALOG, questId)
      if (nextDef) {
        unlocked = await upsertSeed(tx, userId, nextDef)
      }
    }

    return {
      claimed,
      grants: grant.granted,
      unlocked,
      leveledUp: grant.leveledUp,
      newLevel: grant.newLevel,
    }
  },
} as const
