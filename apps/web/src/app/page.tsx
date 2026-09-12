import { Suspense } from 'react'
import { HeroSection } from '@/components/home/HeroSection'
import { CoreLoopSection } from '@/components/home/CoreLoopSection'
import { FactoryShowcase } from '@/components/home/FactoryShowcase'
import { EconomySection, EconomySkeleton } from '@/components/home/EconomySection'
import { CtaSection } from '@/components/home/CtaSection'

/**
 * Idle Factory 랜딩 페이지
 * 루트 레이아웃(`layout.tsx`)이 이미 `<main>`을 렌더링하므로 여기서는 프래그먼트로 섹션만 조립한다.
 * 조립 순서: Hero → CoreLoop → FactoryShowcase → Economy → Cta
 *
 * Economy 는 DB(마켓 피드)를 기다리므로 `<Suspense>` 로 감싼다.
 * 경계가 없으면 피드 조회가 끝날 때까지 페이지 전체 TTFB 가 막힌다.
 */
export default function HomePage() {
  return (
    <>
      <HeroSection />
      <CoreLoopSection />
      <FactoryShowcase />
      <Suspense fallback={<EconomySkeleton />}>
        <EconomySection />
      </Suspense>
      <CtaSection />
    </>
  )
}
