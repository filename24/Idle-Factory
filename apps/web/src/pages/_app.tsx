import '../styles/globals.css'
import type { AppProps } from 'next/app'
import Layout from '@components/Layout'
import { useState } from 'react'
import { Theme } from '@types'

function MyApp({ Component, pageProps }: AppProps) {
  const [theme, setTheme] = useState<Theme>('system')
  return (
    <>
      <Layout setTheme={setTheme} theme={theme}>
        <Component {...pageProps} />
      </Layout>
    </>
  )
}

export default MyApp
