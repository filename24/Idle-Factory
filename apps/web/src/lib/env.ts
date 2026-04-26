function requireEnv(key: string): string {
  const value = process.env[key]
  if (!value) {
    // Next.js 프로덕션 빌드 페이즈에서는 env vars 없어도 빌드 통과
    if (process.env.NEXT_PHASE === 'phase-production-build') return ''
    throw new Error(`Missing required environment variable: ${key}`)
  }
  return value
}

/** 서버 전용 환경변수 — 런타임에만 실제 값 보장 */
export const env = {
  get BETTER_AUTH_SECRET() {
    return requireEnv('BETTER_AUTH_SECRET')
  },
  get DISCORD_CLIENT_ID() {
    return requireEnv('DISCORD_CLIENT_ID')
  },
  get DISCORD_CLIENT_SECRET() {
    return requireEnv('DISCORD_CLIENT_SECRET')
  },
}
