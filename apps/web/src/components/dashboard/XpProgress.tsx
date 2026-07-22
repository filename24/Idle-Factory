import { formatInt } from '@/lib/format'

interface XpProgressProps {
  readonly level: number
  /** 현재 레벨 내 누적 XP (문자열 정수). */
  readonly xpInLevel: string
  /** 다음 레벨 요구 XP (문자열 정수). */
  readonly xpRequired: string
  /** 진행률 0~100. */
  readonly percent: number
}

/**
 * 레벨·XP 진행 바 — 플랫 트랙 위 accent-blue 채움.
 * 근거: docs/design/09-level-xp.md §XP 공식 (레벨 내 XP / 요구 XP).
 */
export function XpProgress({
  level,
  xpInLevel,
  xpRequired,
  percent,
}: XpProgressProps): React.ReactElement {
  const clamped = Math.max(0, Math.min(100, percent))
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="text-ink font-display text-lg">Lv.{level}</span>
        <span className="text-mute text-xs tabular-nums">
          {formatInt(xpInLevel)} / {formatInt(xpRequired)} XP
        </span>
      </div>
      <div
        className="bg-elevated h-2 w-full overflow-hidden rounded-full"
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`레벨 ${level} 경험치 진행률 ${clamped}%`}
      >
        <div className="bg-accent-blue h-full rounded-full" style={{ width: `${clamped}%` }} />
      </div>
    </div>
  )
}
