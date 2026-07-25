import { cn } from '@/lib/utils'

interface EmptyStateProps {
  /** 주 메시지. */
  readonly title: string
  /** 보조 설명 (선택). */
  readonly description?: string
  /** 상단 아이콘/이모지 등 (선택). */
  readonly icon?: React.ReactNode
  readonly className?: string
  readonly children?: React.ReactNode
}

/**
 * 빈 상태 안내 — 데이터 없음/미연결/오류 후 대체 UI 공용 컴포넌트.
 * 플랫 보더 컨테이너 안에 중앙 정렬된 메시지.
 */
export function EmptyState({
  title,
  description,
  icon,
  className,
  children,
}: EmptyStateProps): React.ReactElement {
  return (
    <div
      className={cn(
        'border-hairline bg-surface flex flex-col items-center gap-3 rounded border border-dashed px-6 py-12 text-center',
        className,
      )}
    >
      {icon ? <div className="text-mute">{icon}</div> : null}
      <p className="text-body text-sm break-keep">{title}</p>
      {description ? <p className="text-ash max-w-sm text-xs break-keep">{description}</p> : null}
      {children}
    </div>
  )
}
