import { db } from '../db'
import { buildLandGrid, findAdjacentLandIndices, type LandCell, type LandGrid } from '../land-grid'

/**
 * 내 토지 조회 계층.
 *
 * DB 읽기만 하고, 그리드 조립은 순수 모듈(`lib/land-grid.ts`)에 위임한다.
 * 소유권은 쿼리 `where` 절에서 강제한다 — 남의 토지 번호를 넣어도 `null` 이
 * 나오고 페이지는 `notFound()` 로 떨어진다. 라우트 파라미터를 신뢰하지 않는다.
 */

/** 토지 한 필지 전체 뷰. */
export interface MyLandView extends LandGrid {
  readonly index: number
  /** 보유한 모든 토지 번호(오름차순). */
  readonly ownedIndices: readonly number[]
  readonly prevIndex: number | null
  readonly nextIndex: number | null
}

/** 그리드 셀 — 컴포넌트에서 재export 없이 쓰도록 다시 노출한다. */
export type { LandCell }

/**
 * 유저가 보유한 토지 번호를 오름차순으로 가져온다.
 *
 * @param gameUserId 게임 User.id
 */
export async function listOwnedLandIndices(gameUserId: string): Promise<number[]> {
  const rows = await db.land.findMany({
    where: { userId: gameUserId },
    select: { index: true },
    orderBy: { index: 'asc' },
  })
  return rows.map((row) => row.index)
}

/**
 * 특정 번호의 토지를 조회한다.
 *
 * @param gameUserId 게임 User.id
 * @param index 토지 번호
 * @returns 뷰모델. 보유하지 않은 번호면 `null`
 */
export async function getMyLand(gameUserId: string, index: number): Promise<MyLandView | null> {
  if (!Number.isInteger(index)) return null

  const [land, ownedIndices] = await Promise.all([
    db.land.findUnique({
      // 복합 유니크 키라 남의 토지에 도달할 경로가 없다.
      where: { userId_index: { userId: gameUserId, index } },
      select: {
        index: true,
        slots: { select: { x: true, y: true, type: true, locked: true } },
        factories: {
          select: {
            id: true,
            type: true,
            grade: true,
            anchorX: true,
            anchorY: true,
            width: true,
            height: true,
          },
        },
      },
    }),
    listOwnedLandIndices(gameUserId),
  ])

  if (!land) return null

  const grid = buildLandGrid(land.slots, land.factories)
  const { prevIndex, nextIndex } = findAdjacentLandIndices(ownedIndices, land.index)

  return { ...grid, index: land.index, ownedIndices, prevIndex, nextIndex }
}
