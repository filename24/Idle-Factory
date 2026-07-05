import type { Metadata } from 'next'
import { Geist_Mono } from 'next/font/google'
import './globals.css'
import 'katex/dist/katex.css'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { Agentation } from 'agentation'
import { Providers } from '@/components/layout/Providers'

/** 코드/모노 — 코드 웰과 인라인 코드 (DESIGN.md typography.code-md). */
const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Idle Factory',
  description: 'Discord에서 즐기는 공장 건설 경제 시뮬레이션',
}

/** 루트 레이아웃 — 순수 블랙 캔버스, 디스플레이 세리프 + Pretendard 본문, 공통 Header/Footer 포함 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={`dark ${geistMono.variable} antialiased`} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body>
        <Providers>
          <Header />
          <main>{children}</main>
          <Footer />
          {process.env.NODE_ENV === 'development' && <Agentation />}
        </Providers>
      </body>
    </html>
  )
}
