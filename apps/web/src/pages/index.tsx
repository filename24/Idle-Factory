import CustomSEO from '@components/CustomSEO'
import Section from '@components/Section'
import classNames from 'classnames'
import type { NextPage } from 'next'
import Link from 'next/link'

const develop = true
const Home: NextPage = () => {
  return (
    <main className="min-h-screen w-full">
      <CustomSEO title="디스코드 게임봇" />
      <Section className="bg-dark">
        <div className="w-full max-w-[90rem] p-20 flex h-[100vh] flex-col items-center justify-center">
          <p className="text-6xl font-semibold">Idle Factory</p>
          <p className="text-2xl mt-3">
            모바일 게임의 종류인 Idle Game 기반으로 개발된 게임봇
          </p>
          {develop ? (
            <p className="mt-6 text-3xl">개발중...</p>
          ) : (
            <div className="flex-col items-center justify-center"></div>
          )}
        </div>
      </Section>
      <Section className="bg-white text-black">
        <div className="w-full max-w-[90rem] p-20 flex h-[100vh] flex-col items-center justify-center">
          <p className="">Hello World</p>
        </div>
      </Section>
    </main>
  )
}

export default Home
