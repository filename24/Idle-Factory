/**
 * 분위기 글로우 — 섹션 상단에 앵커된 저투명 radial wash.
 * DESIGN.md "Atmospheric section glows": 섹션당 하나, ~600px 안에서 캔버스 블랙으로 소멸.
 * 솔리드 액센트는 금지이며 이 glow 형태로만 색을 쓴다.
 */
const GLOW_TONES = {
  orange: 'var(--color-accent-orange-glow)',
  blue: 'var(--color-accent-blue-glow)',
  green: 'var(--color-accent-green-glow)',
  red: 'var(--color-accent-red-glow)',
} as const

export type GlowTone = keyof typeof GLOW_TONES

interface GlowProps {
  /** 워시 색상 톤 (섹션 성격에 맞춰 선택) */
  tone?: GlowTone
  /** 글로우가 캔버스로 소멸하는 세로 높이 */
  height?: string
  className?: string
}

/** 섹션 최상단에 배치하는 분위기 radial 글로우 (pointer 이벤트 없음, 스크린리더 무시) */
export function Glow({ tone = 'blue', height = '520px', className }: GlowProps) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-x-0 top-0 -z-10 ${className ?? ''}`}
      style={{
        height,
        background: `radial-gradient(ellipse 58% 100% at 50% 0%, ${GLOW_TONES[tone]}, transparent 72%)`,
      }}
    />
  )
}
