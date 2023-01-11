import CustomSEO from '@components/CustomSEO'
import Section from '@components/Section'
import { isDevelop, nowStatus } from '@utils/Constants'
import type { NextPage } from 'next'
import Image from 'next/image'

const Home: NextPage = () => {
  return (
    <main className="min-h-screen w-full">
      <CustomSEO title="디스코드 게임봇" />
      <Section className="bg-dark">
        <div className="w-full max-w-[90rem] p-20 flex h-[100vh] flex-col items-center justify-center">
          <h1 className="text-6xl  font-semibold">Idle Factory</h1>
          <p className="text-2xl mt-3">
            모바일 게임의 종류인 Idle Game 기반으로 개발된 게임봇
          </p>
          {isDevelop ? (
            <p className="mt-6 text-3xl">개발중...</p>
          ) : (
            <div className="flex-col items-center justify-center"></div>
          )}
        </div>
      </Section>
      <Section className="bg-dark">
        <div className="w-full max-w-[90rem] p-20 flex h-[70vh] items-start justify-between">
          <div>
            <h1 className="text-5xl font-semibold">지속적으로 개발중...</h1>
            <p className="mt-5 text-2xl">
              저희 Idle Factory는 지속적으로 개발을 해나가고 있습니다.
            </p>
            <p className="text-2xl font-medium">현재 단계 : {nowStatus}</p>
          </div>
          <Image
            src="/progressbar/width.png"
            alt="Progress bar"
            width={1280 / 2}
            height="100"
            className=""
          />
        </div>
      </Section>
      <Section className="bg-slate-100 text-black">
        <div className="w-full max-w-[90rem] p-20 flex h-[100vh] flex-col items-center justify-center">
          <p className="">Hello World</p>
        </div>
      </Section>
    </main>
  )
}

export default Home
