/**
 * 퀘스트 도메인 타입.
 *
 * Idle Factory 의 퀘스트 시스템은 (1) 코드 카탈로그(`catalog.ts`)와
 * (2) DB `UserQuest` 행 두 축으로 구성된다. game-core 는 (1) 만 다룬다.
 *
 * Prisma 의 `QuestKind` / `QuestStatus` enum 과 값이 동기화되어야 한다.
 * 변경 시 `packages/database/prisma/schema.prisma` 도 함께 갱신할 것.
 *
 * 참조: docs/design/00-onboarding.md §튜토리얼 퀘스트 체인
 */

import type { FactoryTier, FactoryType, MaterialType } from '../types'

/**
 * 퀘스트 종류. 만료/리셋/시퀀싱 정책의 분기점.
 * Prisma `QuestKind` enum 과 값 동기화.
 */
export type QuestKind = 'TUTORIAL' | 'DAILY' | 'ACHIEVEMENT' | 'EVENT'

/**
 * UserQuest 라이프사이클 상태.
 * Prisma `QuestStatus` enum 과 값 동기화.
 */
export type QuestStatus = 'IN_PROGRESS' | 'COMPLETED' | 'CLAIMED'

/**
 * 퀘스트 보상 한 단위.
 * - `MONEY` : 지갑 잔액 증가 (`User.money += amount`).
 * - `XP`    : 경험치 + 레벨업 트리거 (`xp/level.applyXp` 경유).
 * - `MATERIAL`: 창고에 자재 누적 (`WarehouseStack` upsert).
 */
export type Reward =
  | { readonly kind: 'MONEY'; readonly amount: bigint }
  | { readonly kind: 'XP'; readonly amount: bigint }
  | {
      readonly kind: 'MATERIAL'
      readonly material: MaterialType
      readonly amount: bigint
    }

/**
 * 게임 상태 변화 한 건. 게임 서비스가 같은 트랜잭션 안에서
 * `QuestService.progress(tx, userId, event)` 로 흘려보낸다.
 *
 * `MARKET_LISTED` 는 "자재 판매 행위" 이벤트로, 두 경로에서 발화된다:
 *  1. 유저 상점 등록 (`MarketService.list`)
 *  2. 글로벌 마켓 즉시 판매 (`MarketSellService.sellToGlobal`, #15 U-3)
 * 덕분에 구매자가 없는 1인 서버에서도 튜토리얼 Q3("자재 판매")를 완주할 수
 * 있다 (docs/design/00-onboarding.md §튜토리얼 퀘스트 체인).
 */
export type QuestEvent =
  | {
      readonly kind: 'FACTORY_BUILT'
      readonly tier: FactoryTier
      readonly type: FactoryType
      /** build 직후 `tx.factory.count({ userId, tier })` 결과 (>=1). Q5 minTotal 매칭에 사용. */
      readonly ownedAfter: number
    }
  | {
      readonly kind: 'FACTORY_HARVESTED'
      readonly factoryIds: readonly string[]
      /** 수확된 총 tick 수. 0 이면 발화하지 않는다. */
      readonly tickTotal: number
    }
  | {
      readonly kind: 'FACTORY_UPGRADED'
      readonly fromGrade: number
      readonly toGrade: number
      readonly type: FactoryType
    }
  | {
      readonly kind: 'MARKET_LISTED'
      readonly material: MaterialType
      readonly quantity: bigint
      readonly pricePerUnit: bigint
    }
  | {
      readonly kind: 'WAREHOUSE_UPGRADED'
      readonly toGrade: number
    }

/**
 * 퀘스트 매칭 트리거. 카탈로그 정의에 박혀 `match.ts` 가 이벤트와 비교한다.
 * 옵션 필드(`tier`, `material`, `minToGrade` 등)는 모두 AND 로 결합된다.
 */
export type QuestTrigger =
  | {
      readonly kind: 'FACTORY_BUILT'
      readonly tier?: FactoryTier
      readonly type?: FactoryType
      /** 누적 보유 수 임계 — `event.ownedAfter >= minTotal` 일 때만 매칭. */
      readonly minTotal?: bigint
    }
  | { readonly kind: 'FACTORY_HARVESTED' }
  | {
      readonly kind: 'FACTORY_UPGRADED'
      /** 도달 등급 임계 — `event.toGrade >= minToGrade` 일 때만 매칭. */
      readonly minToGrade?: number
    }
  | {
      readonly kind: 'MARKET_LISTED'
      readonly material?: MaterialType
    }
  | {
      readonly kind: 'WAREHOUSE_UPGRADED'
      readonly minToGrade?: number
    }

/**
 * 퀘스트 체인 메타데이터.
 * - `name` 으로 같은 체인 식별 (예: `'tutorial'`).
 * - `order` 는 1-based 순서.
 * - `next` 가 있으면 클레임 직후 자동 시드되는 다음 노드의 questId.
 */
export interface QuestChain {
  readonly name: string
  readonly order: number
  readonly next?: string
}

/** 퀘스트 카탈로그 정의 한 건. */
export interface QuestDef {
  /** 카탈로그 키 (예: `'tutorial.1'`). DB `UserQuest.questId` 와 일치. */
  readonly id: string
  readonly kind: QuestKind
  /** 시퀀셜 체인 노드 메타. 단발성 퀘스트는 생략. */
  readonly chain?: QuestChain
  /** i18n 키 (예: `'game:quest.tutorial.1.title'`). */
  readonly title: string
  /** i18n 키. */
  readonly description: string
  /** 완료 임계. `progress >= target` 이면 COMPLETED. */
  readonly target: bigint
  /** 완료 시 지급 보상. 시드 시점에 `UserQuest.rewardSnapshot` 으로 저장된다. */
  readonly rewards: readonly Reward[]
  /** 어떤 이벤트에 진행도가 누적될지 정의. */
  readonly trigger: QuestTrigger
}

/**
 * `matchEvent(def, event)` 반환값.
 * - `matched=false` 이면 `increment` 는 0n 으로 보장된다.
 * - `matched=true` 이면 호출자가 `progress + increment` 로 새 값을 만든다.
 */
export interface MatchResult {
  readonly matched: boolean
  readonly increment: bigint
}
