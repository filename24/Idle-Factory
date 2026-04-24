import { HeroSection } from '@/components/home/HeroSection'
import { CoreLoopSection } from '@/components/home/CoreLoopSection'
import { FactoryShowcase } from '@/components/home/FactoryShowcase'
import { EconomySection } from '@/components/home/EconomySection'
import { CtaSection } from '@/components/home/CtaSection'

/** Idle Factory 랜딩 페이지 */
export default function HomePage() {
  return (
    <main>
      <HeroSection />
      <CoreLoopSection />
      <FactoryShowcase />
      <EconomySection />
      <CtaSection />
    </main>
  )
}
