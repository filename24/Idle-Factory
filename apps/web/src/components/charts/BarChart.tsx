import { cn } from '@/lib/utils'

/**
 * 막대 차트 한 점.
 * `value` 는 막대 높이 비율 산정용(정밀도 손실 무방), `display` 는 툴팁/라벨 표기용.
 */
export interface BarDatum {
  /** x축 라벨 (짧게). */
  readonly label: string
  /** 높이 비율용 수치 (>= 0). */
  readonly value: number
  /** 툴팁·값 표기 문자열 (미지정 시 value). */
  readonly display?: string
}

interface BarChartProps {
  readonly data: readonly BarDatum[]
  /** 막대 색 CSS 변수/색상 (기본 chart-1 블루). */
  readonly color?: string
  /** 차트 높이 (Tailwind h-* 클래스). */
  readonly heightClass?: string
  /** 스크린리더용 차트 설명. */
  readonly ariaLabel: string
  readonly className?: string
}

/**
 * 순수 SSR 막대 차트 — 의존성 없는 CSS flex 구현.
 *
 * DESIGN.md 터미널 네이티브(플랫·모노스페이스·보더 깊이)에 맞춰 Recharts 대신
 * 경량 자체 구현을 사용한다(#20 §주요 고려사항의 "코드베이스 상황에 따라 조정").
 * 막대에 hover 하면 네이티브 `title` 툴팁으로 값을 보여준다. 데이터가 비면 호출측이
 * 빈 상태를 렌더링하므로 이 컴포넌트는 항상 최소 1개 점을 가정한다.
 */
export function BarChart({
  data,
  color = 'var(--color-chart-1)',
  heightClass = 'h-40',
  ariaLabel,
  className,
}: BarChartProps): React.ReactElement {
  const max = data.reduce((m, d) => Math.max(m, d.value), 0)
  return (
    <figure className={cn('w-full', className)} role="img" aria-label={ariaLabel}>
      <div className={cn('flex w-full items-end gap-[3px]', heightClass)}>
        {data.map((d, i) => {
          const pct = max > 0 ? (d.value / max) * 100 : 0
          const shown = d.display ?? String(d.value)
          return (
            <div
              key={`${d.label}-${i}`}
              className="relative h-full min-w-0 flex-1"
              title={`${d.label}: ${shown}`}
            >
              <div
                className="absolute bottom-0 w-full rounded-t-[2px]"
                style={{
                  height: `${pct}%`,
                  backgroundColor: color,
                  minHeight: d.value > 0 ? '3px' : '0',
                }}
                aria-hidden="true"
              />
            </div>
          )
        })}
      </div>
      <div className="mt-1.5 flex w-full gap-[3px]">
        {data.map((d, i) => (
          <span
            key={`label-${d.label}-${i}`}
            className="text-ash min-w-0 flex-1 truncate text-center text-[10px] tabular-nums"
          >
            {d.label}
          </span>
        ))}
      </div>
    </figure>
  )
}
