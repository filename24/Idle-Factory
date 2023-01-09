import '../styles/globals.css'
import type { AppProps } from 'next/app'
import Layout from '@components/Layout'

function MyApp({ Component, pageProps }: AppProps) {
  // TODO: Theme system
  // const [theme, setTheme] = useState<Theme>('system')

  // useEffect(() => {
  //   if (!localStorage.theme) {
  //     setTheme(systemTheme())
  //     localStorage.setItem('theme', theme)
  //   } else setTheme(localStorage.theme)
  // }, [theme])

  return (
    <Layout>
      <Component {...pageProps} />
    </Layout>
  )
}

export default MyApp
