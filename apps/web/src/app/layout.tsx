import type { Metadata } from 'next'
import { IBM_Plex_Mono } from 'next/font/google'
import './globals.css'
import 'katex/dist/katex.css'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { Agentation } from 'agentation'
import { Providers } from '@/components/layout/Providers'

/**
 * 단일 서체 — IBM Plex Mono(라틴/코드) + Nanum Gothic Coding(한글, Google Fonts 링크).
 * DESIGN.md "one font, one voice": 헤딩·본문·버튼·내비 모두 모노스페이스. Berkeley Mono의
 * 오픈 대체제로 IBM Plex Mono(DESIGN.md 폴백 1순위)를 self-host, 한글은 나눔고딕코딩으로 폴백.
 */
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-plex-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Idle Factory',
  description: 'Discord에서 즐기는 공장 건설 경제 시뮬레이션',
}

/** 루트 레이아웃 — 웜 다크(#171717) 터미널 캔버스, 모노스페이스 단일 서체, 공통 Header/Footer 포함 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={`dark ${plexMono.variable} antialiased`} suppressHydrationWarning>
      <head>
        {/* 한글 모노스페이스 — 나눔고딕코딩(라틴은 IBM Plex Mono가 우선, 한글만 폴백) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- 루트 레이아웃 <head>라 전 페이지에 적용됨(규칙 오탐) */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Nanum+Gothic+Coding:wght@400;700&display=swap"
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
