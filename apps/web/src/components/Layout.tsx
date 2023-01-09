import Footer from './Footer'
import Header from './Header'

const Layout: React.FC<{
  children: React.ReactNode
}> = ({ children }) => {
  return (
    <div className="font-pretendard bg-dark text-white">
      <div className="w-full min-h-screen flex flex-col">
        <Header />

        {children}
        <Footer />
      </div>
    </div>
  )
}

export default Layout
