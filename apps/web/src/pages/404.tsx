import CustomSEO from '@components/CustomSEO'
import Section from '@components/Section'
import { nowStatus } from '@utils/Constants'
import type { NextPage } from 'next'
import Image from 'next/image'

const NotFound: NextPage = () => {
  return (
    <>
      <CustomSEO title="404" description="어라 없는 페이지 인거같은데?" />
      <Section>
        <div className="w-full max-w-[90rem] p-20 flex h-[100vh] flex-col items-center justify-center">
          <p className="text-6xl">404ㅣNot Found</p>
          <p className="mt-4 text-2xl">
            현재 Idle Factory는 출시전 Developing 단계를 거치고 있습니다.
          </p>
          <p className="mt-4 text-2xl">현재 단계: {nowStatus}</p>
          <Image
            src="/progress-bar.jpg"
            alt="Progress bar"
            width="1280"
            height="200"
          />
        </div>
      </Section>
    </>
  )
}

export default NotFound
