/** 환경변수 필수 검증 — 누락 시 즉시 에러 */
function requireEnv(key: string): string {
  const value = process.env[key]
  if (!value) throw new Error(`Missing required environment variable: ${key}`)
  return value
}

/** 서버 전용 환경변수 (빌드 타임 검증) */
export const env = {
  BETTER_AUTH_SECRET: requireEnv('BETTER_AUTH_SECRET'),
  DISCORD_CLIENT_ID: requireEnv('DISCORD_CLIENT_ID'),
  DISCORD_CLIENT_SECRET: requireEnv('DISCORD_CLIENT_SECRET'),
} as const
