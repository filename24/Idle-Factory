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
      /**
       * `identify`·`email` 기본 스코프에 `guilds` 를 더한다.
       *
       * 서버 관리자 콘솔이 "이 유저가 그 서버에서 ManageGuild 를 갖는가"를
       * 판정하려면 유저의 길드 목록이 필요하다. `guilds` 는 부분 길드 객체에
       * `owner` 와 **계산된** `permissions` 를 함께 주므로 요청 한 번으로 모든
       * 서버를 판정할 수 있다. `guilds.members.read` 는 서버마다 요청이
       * 필요하고 계산된 권한도 주지 않는다.
       *
       * 스코프를 추가해도 **기존 세션은 자동으로 갱신되지 않는다.**
       * `AuthAccount.scope`(콤마 결합)에 `guilds` 가 없으면 재동의를 유도해야
       * 하며, 그 판정은 `lib/discord/permissions.ts` 의 `hasScope` 가 한다.
       */
      scope: ['guilds'],
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
