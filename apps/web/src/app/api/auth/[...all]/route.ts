import { toNextJsHandler } from 'better-auth/next-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { auth } = await import('@/lib/auth')
  return toNextJsHandler(auth).GET(req)
}

export async function POST(req: Request) {
  const { auth } = await import('@/lib/auth')
  return toNextJsHandler(auth).POST(req)
}
