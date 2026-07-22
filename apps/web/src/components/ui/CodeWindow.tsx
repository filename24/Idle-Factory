import type { ReactNode } from 'react'

/**
 * 코드/터미널 웰 — DESIGN.md component.code-window.
 * surface-deep 배경 + hairline-strong 보더 + 상단 트래픽라이트 3점(red/yellow/green).
 * 이 시스템에서 세 시맨틱 색이 솔리드로 함께 등장하는 유일한 지점.
 */
interface CodeWindowProps {
  /** 상단 탭/파일명 라벨 (예: "/factory build") */
  label?: string
  children: ReactNode
  className?: string
}

/** 트래픽라이트 헤더가 달린 모노스페이스 코드 웰 */
export function CodeWindow({ label, children, className }: CodeWindowProps) {
  return (
    <div
      className={`border-hairline-strong bg-deep overflow-hidden rounded-xl border ${className ?? ''}`}
    >
      {/* 트래픽라이트 크롬 */}
      <div className="border-hairline flex items-center gap-3 border-b px-4 py-3">
        <div className="flex items-center gap-1.5">
          <span className="bg-accent-red/90 size-3 rounded-full" />
          <span className="bg-accent-yellow/90 size-3 rounded-full" />
          <span className="bg-accent-green/90 size-3 rounded-full" />
        </div>
        {label ? <span className="text-mute font-mono text-xs tracking-tight">{label}</span> : null}
      </div>
      {/* 코드 본문 */}
      <div className="text-body overflow-x-auto p-6 font-mono text-[13px] leading-relaxed">
        {children}
      </div>
    </div>
  )
}
