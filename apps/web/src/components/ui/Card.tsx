import { type HTMLAttributes, forwardRef } from 'react'
import { twMerge } from 'tailwind-merge'

/** 기본 카드 컨테이너 */
export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={twMerge(
        'rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5',
        className,
      )}
      {...props}
    />
  ),
)
Card.displayName = 'Card'

/** 카드 헤더 영역 */
export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={twMerge('mb-3 flex items-center justify-between gap-2', className)}
      {...props}
    />
  ),
)
CardHeader.displayName = 'CardHeader'

/** 카드 본문 영역 */
export const CardBody = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={twMerge('text-[var(--color-muted)]', className)} {...props} />
  ),
)
CardBody.displayName = 'CardBody'
