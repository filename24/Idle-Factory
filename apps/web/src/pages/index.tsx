import CustomSEO from '@components/CustomSEO'
import type { NextPage } from 'next'

const Home: NextPage = () => {
  return (
    <>
      <CustomSEO title="Hello World" />
      <div>
        <p>Hello World</p>
      </div>
    </>
  )
}

export default Home
