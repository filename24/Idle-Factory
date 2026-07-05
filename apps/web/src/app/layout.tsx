import type { Metadata } from 'next'
import { Fraunces, Gowun_Batang, Geist_Mono } from 'next/font/google'
import './globals.css'
import 'katex/dist/katex.css'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { Agentation } from 'agentation'
import { Providers } from '@/components/layout/Providers'

/**
 * 에디토리얼 디스플레이 세리프 — 라틴 헤드라인 (Domaine Display 대체).
 * opsz(광학 크기)로 대형 헤드라인에서 고대비 마젠타 느낌을 낸다. DESIGN.md typography.display-* 참조.
 */
const fraunces = Fraunces({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  axes: ['opsz'],
  variable: '--font-fraunces',
  display: 'swap',
})

/** 한글 디스플레이 세리프 — Fraunces가 커버하지 못하는 한글 글리프 폴백. */
const gowunBatang = Gowun_Batang({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-gowun-batang',
  display: 'swap',
})

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
    <html
      lang="ko"
      className={`dark ${fraunces.variable} ${gowunBatang.variable} ${geistMono.variable} antialiased`}
      suppressHydrationWarning
    >
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
