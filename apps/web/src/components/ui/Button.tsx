'use client'

import { type ButtonHTMLAttributes, forwardRef } from 'react'
import { twMerge } from 'tailwind-merge'
import { clsx } from 'clsx'

/** 버튼 변형: primary(솔리드 골드), secondary(서브 배경), ghost(아웃라인 골드) */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost'

/** 버튼 크기 */
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

const base =
  'inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold)] disabled:opacity-40 disabled:pointer-events-none cursor-pointer'

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--color-gold)] text-[var(--color-canvas)] hover:bg-[var(--color-gold-dim)] active:scale-[0.98]',
  secondary:
    'bg-[var(--color-elevated)] text-[var(--color-foreground)] border border-[var(--color-border)] hover:bg-[var(--color-border)]',
  ghost:
    'text-[var(--color-gold)] border border-[var(--color-gold)] hover:bg-[var(--color-gold-subtle)]',
}

const sizes: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-base',
  lg: 'px-6 py-3 text-lg',
}

/** 게임 테마 버튼 컴포넌트 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', className, ...props }, ref) => (
    <button
      ref={ref}
      className={twMerge(clsx(base, variants[variant], sizes[size], className))}
      {...props}
    />
  ),
)

Button.displayName = 'Button'
