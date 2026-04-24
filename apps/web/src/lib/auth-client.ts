'use client'

import { createAuthClient } from 'better-auth/react'

/** 클라이언트 컴포넌트용 better-auth 클라이언트 */
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL ?? '',
})

export const { useSession, signIn, signOut } = authClient
