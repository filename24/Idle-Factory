import type { ReactNode } from 'react'

/** 피처 리스트 한 항목 (아이콘은 Lucide 컴포넌트, 이모지 금지) */
export interface FeatureItem {
  /** 선두 마커 — Lucide 아이콘 노드 (예: <Factory className="size-5" />) */
  icon?: ReactNode
  /** 피처 이름 (모노 700, ink) */
  name: string
  /** 설명 (모노 400, mute) */
  description: ReactNode
}

interface FeatureListProps {
  items: FeatureItem[]
  /** 항목 사이 헤어라인 구분선 (스펙시트 룩) */
  divided?: boolean
  className?: string
}

/**
 * 피처 리스트 — DESIGN.md "Feature List" 특징 컴포넌트.
 * 카드/보더 없는 순수 텍스트 레이아웃: 이름 700 · 설명 400 · 촘촘한 세로 리듬.
 * 깊이는 헤어라인 구분선(divided)으로만, 그림자/카드 배경 없음.
 */
export function FeatureList({ items, divided = false, className }: FeatureListProps) {
  return (
    <ul className={`flex flex-col ${divided ? 'gap-0' : 'gap-8'} ${className ?? ''}`}>
      {items.map((item, i) => (
        <li
          key={item.name}
          className={
            divided
              ? 'border-hairline flex gap-4 border-t py-6 first:border-t-0 first:pt-0'
              : 'flex gap-4'
          }
        >
          {item.icon ? (
            <span
              aria-hidden="true"
              className="text-mute mt-0.5 flex shrink-0 items-center justify-center"
            >
              {item.icon}
            </span>
          ) : (
            <span aria-hidden="true" className="text-ash mt-0.5 shrink-0 tabular-nums select-none">
              {String(i + 1).padStart(2, '0')}
            </span>
          )}
          <div className="flex flex-col gap-1.5">
            <h3 className="text-ink text-base font-bold break-keep">{item.name}</h3>
            <p className="text-mute text-[0.9375rem] leading-relaxed break-keep">
              {item.description}
            </p>
          </div>
        </li>
      ))}
    </ul>
  )
}
