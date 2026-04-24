import Image from 'next/image'
import { twMerge } from 'tailwind-merge'

/** 아바타 크기 */
export type AvatarSize = 'sm' | 'md' | 'lg'

export interface AvatarProps {
  /** Discord CDN 이미지 URL 또는 일반 URL */
  src?: string | null
  /** 유저 이름 (alt 텍스트 및 폴백 이니셜) */
  name: string
  size?: AvatarSize
  className?: string
}

const sizeMap: Record<AvatarSize, { px: number; cls: string }> = {
  sm: { px: 32, cls: 'w-8 h-8 text-xs' },
  md: { px: 40, cls: 'w-10 h-10 text-sm' },
  lg: { px: 56, cls: 'w-14 h-14 text-base' },
}

/** Discord 아바타 — 이미지가 없으면 이니셜 폴백 */
export function Avatar({ src, name, size = 'md', className }: AvatarProps) {
  const { px, cls } = sizeMap[size]
  const initial = name.charAt(0).toUpperCase()

  return (
    <div
      className={twMerge(
        'relative shrink-0 overflow-hidden rounded-full border border-[var(--color-border)] bg-[var(--color-elevated)] select-none',
        cls,
        className,
      )}
    >
      {src ? (
        <Image
          src={src}
          alt={name}
          width={px}
          height={px}
          className="object-cover"
          unoptimized={src.includes('cdn.discordapp.com')}
        />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center font-semibold text-[var(--color-gold)]">
          {initial}
        </span>
      )}
    </div>
  )
}
