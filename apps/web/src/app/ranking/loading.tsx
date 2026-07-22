/** 랭킹 로딩 스켈레톤 — 탭/테이블 자리 표시. */
export default function RankingLoading(): React.ReactElement {
  return (
    <section
      className="mx-auto max-w-4xl px-4 py-10 sm:px-6"
      aria-busy="true"
      aria-label="랭킹 불러오는 중"
    >
      <div className="mb-6 space-y-2">
        <div className="bg-elevated h-8 w-24 animate-pulse rounded" />
        <div className="bg-surface h-4 w-40 animate-pulse rounded" />
      </div>
      <div className="border-hairline mb-4 flex gap-4 border-b pb-2">
        <div className="bg-elevated h-6 w-20 animate-pulse rounded" />
        <div className="bg-surface h-6 w-20 animate-pulse rounded" />
      </div>
      <div className="border-hairline divide-divider-soft divide-y rounded border">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3">
            <div className="bg-surface h-4 w-6 animate-pulse rounded" />
            <div className="bg-surface h-4 flex-1 animate-pulse rounded" />
            <div className="bg-surface h-4 w-16 animate-pulse rounded" />
          </div>
        ))}
      </div>
    </section>
  )
}
