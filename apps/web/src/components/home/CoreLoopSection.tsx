import { ArrowLeftRight, Cog, Hammer } from 'lucide-react'
import { FeatureList } from '@/components/ui/FeatureList'

/** 핵심 게임 루프 3단계 섹션 */
export function CoreLoopSection() {
  return (
    <section className="border-hairline border-y">
      <div className="mx-auto max-w-4xl px-4 py-20 sm:px-6 sm:py-28">
        {/* 섹션 헤더 — 좌정렬 */}
        <div className="text-mute mb-2 text-xs font-medium tracking-[0.18em] uppercase">
          {'// 핵심 루프'}
        </div>
        <h2 className="font-display text-ink text-2xl leading-tight break-keep sm:text-3xl">
          간단한 3단계, 무한한 전략
        </h2>
        <p className="text-charcoal mt-3 max-w-xl text-base leading-relaxed break-keep">
          복잡한 조작 없이 명령어 하나로 제국을 키워가세요
        </p>

        {/* 단계 목록 */}
        <div className="mt-12">
          <FeatureList
            divided
            items={STEPS.map((step) => ({
              icon: step.icon,
              name: step.title,
              description: (
                <>
                  {step.description}{' '}
                  <span className="border-hairline bg-elevated text-mute mt-1 inline-flex items-center rounded border px-2 py-0.5 align-middle font-mono text-[13px] tracking-wider uppercase">
                    {step.cmd}
                  </span>
                </>
              ),
            }))}
          />
        </div>
      </div>
    </section>
  )
}

const STEPS = [
  {
    title: '토지 구매 & 공장 건설',
    description:
      '서버 화폐로 토지를 구입하고 슬롯에 T1~T3 공장을 배치하세요. 특수 슬롯은 보너스를 제공합니다.',
    cmd: '/build',
    icon: <Hammer className="size-5" />,
  },
  {
    title: '자동 생산',
    description:
      '공장은 24시간 쉬지 않고 자재를 생산합니다. 업그레이드할수록 생산 효율이 기하급수적으로 증가합니다.',
    cmd: '/status',
    icon: <Cog className="size-5" />,
  },
  {
    title: '마켓 거래',
    description:
      '글로벌 마켓에서 자재를 사고팔아 수익을 극대화하세요. 수급에 따라 가격이 실시간으로 변동됩니다.',
    cmd: '/market',
    icon: <ArrowLeftRight className="size-5" />,
  },
]
