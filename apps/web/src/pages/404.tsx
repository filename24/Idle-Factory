import Section from '@components/Section'
import type { NextPage } from 'next'

const NotFound: NextPage = () => {
  return (
    <Section>
      <div className="w-full max-w-[90rem] p-20 flex h-[100vh] flex-col items-center justify-center">
        <p className="text-6xl">404ㅣNot Found</p>
        <p className="mt-4 text-2xl">
          현재 Idle Factory는 출시전 Developing 단계를 거치고 있습니다.
        </p>
        <p className="mt-4 text-2xl">출시 단계</p>
      </div>
    </Section>
  )
}

export default NotFound
