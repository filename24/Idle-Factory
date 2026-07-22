import { redirect } from 'next/navigation'

/**
 * /dashboard 인덱스 — 개인 대시보드로 리다이렉트.
 * 헤더 로그인 콜백(callbackURL='/dashboard')과 로그인 페이지 기본 리다이렉트 경로를
 * 실제 페이지(/dashboard/me)로 연결한다.
 */
export default function DashboardIndexPage(): never {
  redirect('/dashboard/me')
}
