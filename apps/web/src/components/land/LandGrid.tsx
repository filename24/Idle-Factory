import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { Lock, Sparkles } from 'lucide-react'
import { FACTORY_CATALOG, type FactoryType } from '@idle/game-core'
import { cn } from '@/lib/utils'
import type { LandCell } from '@/lib/land-grid'

/**
 * 토지 4×4 그리드.
 *
 * 서버 컴포넌트다 — 셀 자체에는 상호작용이 없고, 공장이 있는 칸만 상세로 가는
 * 링크가 된다.
 *
 * ## 왜 DOM 순서가 아니라 좌표로 배치하는가
 *
 * 2×2 공장(T3)은 두 칸을 가로·세로로 걸친다. DOM 순서에 의존하면 덮인 칸이
 * 앵커보다 앞에 오는 배치에서 그리드가 어긋난다. 각 셀에 `col-start`/`row-start`
 * 를 명시하고 덮인 칸은 렌더를 건너뛰면 순서와 무관해진다.
 *
 * Tailwind v4 는 소스에 **문자열 리터럴로 등장하는** 클래스만 인식하므로
 * `col-start-${x+1}` 같은 보간은 조용히 아무 스타일도 만들지 않는다. 그래서
 * 아래처럼 정적 배열로 미리 적어 둔다.
 */

/** 열 시작 위치 클래스. 인덱스 = x 좌표. */
const COL_START = ['col-start-1', 'col-start-2', 'col-start-3', 'col-start-4'] as const
/** 행 시작 위치 클래스. 인덱스 = y 좌표. */
const ROW_START = ['row-start-1', 'row-start-2', 'row-start-3', 'row-start-4'] as const
/** 2칸 확장 클래스 — 2×2 공장용. */
const SPAN_2 = 'col-span-2 row-span-2'

interface LandGridProps {
  readonly cells: readonly LandCell[]
  readonly landIndex: number
}

export async function LandGrid({ cells, landIndex }: LandGridProps): Promise<React.ReactElement> {
  const t = await getTranslations('land')

  return (
    <div
      role="grid"
      aria-label={t('gridLabel', { index: landIndex })}
      className="border-hairline bg-surface grid aspect-square w-full max-w-md grid-cols-4 grid-rows-4 gap-1.5 rounded border p-1.5"
    >
      {cells.map((cell) =>
        // 덮인 칸은 앵커가 대신 자리를 차지하므로 렌더하지 않는다.
        cell.kind === 'COVERED' ? null : <LandCellTile key={`${cell.x},${cell.y}`} cell={cell} />,
      )}
    </div>
  )
}

/** 셀 한 칸. */
async function LandCellTile({ cell }: { readonly cell: LandCell }): Promise<React.ReactElement> {
  const t = await getTranslations('land')
  const tFactory = await getTranslations('factory.type')

  const position = cn(COL_START[cell.x], ROW_START[cell.y])
  const base =
    'flex flex-col items-center justify-center gap-0.5 rounded-sm border text-center transition-colors'

  if (cell.kind === 'LOCKED') {
    return (
      <div
        role="gridcell"
        aria-label={t('cell.locked', { x: cell.x + 1, y: cell.y + 1 })}
        className={cn(
          base,
          position,
          'border-divider-soft bg-elevated/40 text-mute border-dashed opacity-60',
        )}
      >
        <Lock aria-hidden="true" className="size-3.5" />
      </div>
    )
  }

  if (cell.kind === 'FACTORY' && cell.factory) {
    const entry = FACTORY_CATALOG[cell.factory.type as FactoryType]
    const hasBonus = cell.factory.slotBonus > 1 || cell.factory.synergyBonus > 1
    const isLarge = cell.factory.width > 1 || cell.factory.height > 1

    return (
      <Link
        href={`/dashboard/me/factory/${cell.factory.id}`}
        role="gridcell"
        aria-label={t('cell.factory', {
          name: tFactory(cell.factory.type),
          grade: cell.factory.grade,
        })}
        className={cn(
          base,
          position,
          isLarge && SPAN_2,
          'border-hairline-strong bg-elevated hover:border-accent-orange focus-visible:ring-ring p-1 outline-none focus-visible:ring-2',
        )}
      >
        <span aria-hidden="true" className="text-lg leading-none">
          {entry?.emoji ?? '🏭'}
        </span>
        <span className="text-ink w-full truncate px-0.5 text-[10px] leading-tight">
          {tFactory(cell.factory.type)}
        </span>
        <span className="text-ash text-[10px] tabular-nums">G{cell.factory.grade}</span>
        {hasBonus && (
          <Sparkles aria-hidden="true" className="text-accent-orange absolute size-3 opacity-0" />
        )}
      </Link>
    )
  }

  // EMPTY 또는 SPECIAL
  const isSpecial = cell.kind === 'SPECIAL'
  return (
    <div
      role="gridcell"
      aria-label={
        isSpecial
          ? t('cell.special', { type: t(`slotType.${cell.slotType}`) })
          : t('cell.empty', { x: cell.x + 1, y: cell.y + 1 })
      }
      className={cn(
        base,
        position,
        isSpecial
          ? 'border-accent-orange/40 bg-accent-orange/5 text-accent-orange'
          : 'border-divider-soft text-mute',
      )}
    >
      {isSpecial && <Sparkles aria-hidden="true" className="size-3.5" />}
      <span className="text-[10px] leading-tight">
        {isSpecial ? t(`slotType.${cell.slotType}`) : ''}
      </span>
    </div>
  )
}
