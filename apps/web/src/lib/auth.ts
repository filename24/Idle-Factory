import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { db } from './db'
import { env } from './env'

/** better-auth 인스턴스 — Discord OAuth, Prisma 어댑터, AuthUser/Session/Account 모델 매핑 */
export const auth = betterAuth({
  database: prismaAdapter(db, { provider: 'postgresql' }),
  socialProviders: {
    discord: {
      clientId: env.DISCORD_CLIENT_ID,
      clientSecret: env.DISCORD_CLIENT_SECRET,
    },
  },
  onAPIError: {
    // 기본값 '/api/auth/error' 는 better-auth 가 만든 영문 HTML 을 그대로 뱉는다.
    // 우리 디자인 시스템 안의 한국어 안내 페이지로 돌린다(src/app/auth/error).
    errorURL: '/auth/error',
  },
  user: { modelName: 'authUser' },
  session: { modelName: 'authSession' },
  account: { modelName: 'authAccount' },
  verification: { modelName: 'authVerification' },
})

export type Session = typeof auth.$Infer.Session
