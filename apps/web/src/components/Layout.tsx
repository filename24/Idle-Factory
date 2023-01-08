import { Theme } from '@types'
import { ReactNode } from 'react'
import Footer from './Footer'
import Header from './Header'

const Layout: React.FC<{
  children: ReactNode
  theme: Theme
  setTheme: (theme: Theme) => void
}> = ({ children }) => {
  return (
    <div className="dark:bg-dark dark:text-white text-black bg-white">
      <div className="w-full min-h-screen flex flex-col">
        <Header />
        {children}
        <Footer />
      </div>
    </div>
  )
}

export default Layout
