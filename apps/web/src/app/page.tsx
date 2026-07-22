import { HeroSection } from '@/components/home/HeroSection'
import { CoreLoopSection } from '@/components/home/CoreLoopSection'
import { FactoryShowcase } from '@/components/home/FactoryShowcase'
import { EconomySection } from '@/components/home/EconomySection'
import { CtaSection } from '@/components/home/CtaSection'

/**
 * Idle Factory 랜딩 페이지
 * 루트 레이아웃(`layout.tsx`)이 이미 `<main>`을 렌더링하므로 여기서는 프래그먼트로 섹션만 조립한다.
 * 조립 순서: Hero → CoreLoop → FactoryShowcase → Economy → Cta
 */
export default function HomePage() {
  return (
    <>
      <HeroSection />
      <CoreLoopSection />
      <FactoryShowcase />
      <EconomySection />
      <CtaSection />
    </>
  )
}
