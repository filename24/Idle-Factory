import type { Metadata } from 'next'
import { IBM_Plex_Mono } from 'next/font/google'
import './globals.css'
import 'katex/dist/katex.css'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getTranslations } from 'next-intl/server'
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

/** 메타데이터도 현재 로케일을 따른다 — 공유 카드/검색 결과가 화면과 어긋나지 않게. */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta')
  return {
    title: t('title'),
    description: t('description'),
  }
}

/** 루트 레이아웃 — 웜 다크(#171717) 터미널 캔버스, 모노스페이스 단일 서체, 공통 Header/Footer 포함 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // 쿠키로 정해진 현재 로케일. <html lang> 이 실제 본문 언어와 어긋나면
  // 스크린리더 발음과 브라우저 번역 판단이 모두 틀어진다.
  const locale = await getLocale()

  return (
    <html
      lang={locale}
      className={`dark ${plexMono.variable} antialiased`}
      suppressHydrationWarning
    >
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
        <NextIntlClientProvider>
          <Providers>
            <Header />
            <main>{children}</main>
            <Footer />
            {process.env.NODE_ENV === 'development' && <Agentation />}
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
