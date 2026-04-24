import { type HTMLAttributes } from 'react'
import { twMerge } from 'tailwind-merge'
import { clsx } from 'clsx'

/** 뱃지 색상 변형 */
export type BadgeVariant = 'gold' | 'green' | 'red' | 'blue' | 'default'

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
}

const variants: Record<BadgeVariant, string> = {
  gold: 'bg-[var(--color-gold-subtle)] text-[var(--color-gold)] border-[var(--color-gold-dim)]',
  green:
    'bg-[oklch(65%_0.18_145/0.15)] text-[var(--color-success)] border-[oklch(65%_0.18_145/0.4)]',
  red: 'bg-[oklch(62%_0.22_25/0.15)] text-[var(--color-danger)] border-[oklch(62%_0.22_25/0.4)]',
  blue: 'bg-[oklch(65%_0.18_250/0.15)] text-[oklch(70%_0.18_250)] border-[oklch(65%_0.18_250/0.4)]',
  default: 'bg-[var(--color-elevated)] text-[var(--color-muted)] border-[var(--color-border)]',
}

/** 공장 티어, 등급, 타입 표시용 소형 뱃지 */
export function Badge({ variant = 'default', className, ...props }: BadgeProps) {
  return (
    <span
      className={twMerge(
        clsx(
          'inline-flex items-center rounded-[var(--radius-sm)] border px-1.5 py-0.5 text-xs font-medium',
          variants[variant],
          className,
        ),
      )}
      {...props}
    />
  )
}
