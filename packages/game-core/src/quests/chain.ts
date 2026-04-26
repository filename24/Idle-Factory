/**
 * 퀘스트 체인 그래프 탐색.
 *
 * `chain.next` 포인터를 따라 다음 노드를 안전하게 조회한다.
 * - 존재하지 않는 questId, 다음 노드가 없는 종착 노드, 사이클 모두 `null` 반환.
 * - 사이클 가드는 방문 집합으로 구현.
 */

import type { QuestDef } from './types'

/**
 * 주어진 카탈로그에서 `currentId` 의 다음 체인 노드를 반환한다.
 *
 * @param catalog 전체 카탈로그 (대개 `QUEST_CATALOG`).
 * @param currentId 현재 questId.
 * @returns 다음 정의 객체 또는 `null` (종착·미존재·사이클).
 */
export function getNextInChain(
  catalog: Readonly<Record<string, QuestDef>>,
  currentId: string,
): QuestDef | null {
  const current = catalog[currentId]
  if (!current?.chain?.next) return null

  const visited = new Set<string>([currentId])
  let cursor: string | undefined = current.chain.next
  while (cursor !== undefined) {
    if (visited.has(cursor)) return null // 사이클 가드
    visited.add(cursor)
    const next = catalog[cursor]
    if (!next) return null
    return next
  }
  return null
}

/**
 * 카탈로그 그래프 무결성 검사 결과.
 * 빌드/테스트 시점에 사용 — 런타임에서는 호출하지 않아도 된다.
 */
export interface ChainIntegrityReport {
  /** 카탈로그에 존재하지 않는 `chain.next` 포인터 보유 questId 목록. */
  readonly danglingNexts: readonly string[]
  /** 사이클을 형성하는 questId 목록 (사이클의 시작점만). */
  readonly cycles: readonly string[]
}

/**
 * 카탈로그의 체인 그래프 무결성을 검증한다. 테스트 가드용.
 */
export function validateChainIntegrity(
  catalog: Readonly<Record<string, QuestDef>>,
): ChainIntegrityReport {
  const danglingNexts: string[] = []
  const cycles: string[] = []

  for (const def of Object.values(catalog)) {
    if (!def.chain?.next) continue
    if (!catalog[def.chain.next]) {
      danglingNexts.push(def.id)
      continue
    }

    // 사이클 검출 — 현재 노드부터 출발해 자기 자신으로 돌아오는지
    const visited = new Set<string>()
    let cursor: string | undefined = def.id
    while (cursor !== undefined) {
      if (visited.has(cursor)) {
        cycles.push(def.id)
        break
      }
      visited.add(cursor)
      cursor = catalog[cursor]?.chain?.next
    }
  }

  return { danglingNexts, cycles }
}
