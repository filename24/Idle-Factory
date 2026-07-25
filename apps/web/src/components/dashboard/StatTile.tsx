import { cn } from '@/lib/utils'

interface StatTileProps {
  /** 지표 라벨 (예: "금고 잔액"). */
  readonly label: string
  /** 주요 값 (이미 포맷된 문자열). */
  readonly value: string
  /** 값 우측/하단 보조 텍스트 (단위·부연). */
  readonly hint?: string
  /** 값 색상 유틸리티 클래스 (기본 text-ink). */
  readonly valueClassName?: string
  readonly className?: string
}

/**
 * 통계 타일 — 플랫 보더 카드 위 라벨 + 큰 값 + 힌트.
 * DESIGN.md: 그림자/그라디언트 없이 헤어라인 보더 + 배경 명도 차이로만 깊이 표현.
 */
export function StatTile({
  label,
  value,
  hint,
  valueClassName,
  className,
}: StatTileProps): React.ReactElement {
  return (
    <div
      className={cn('border-hairline bg-surface flex flex-col gap-1 rounded border p-4', className)}
    >
      <span className="text-mute text-xs tracking-wide uppercase">{label}</span>
      <span className={cn('text-ink font-display text-2xl tabular-nums', valueClassName)}>
        {value}
      </span>
      {hint ? <span className="text-ash text-xs">{hint}</span> : null}
    </div>
  )
}
