import { NextResponse } from 'next/server'

/**
 * 라우트 핸들러 공통 JSON 응답 봉투.
 * `_lib` 언더스코어 접두 폴더는 Next 라우팅에서 제외되는 private 폴더다.
 * 근거: rules/common/patterns.md §API Response Format.
 */
export interface ApiEnvelope<T> {
  readonly ok: boolean
  readonly data: T | null
  readonly error: string | null
}

/** 성공 응답 (200 기본). */
export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json<ApiEnvelope<T>>({ ok: true, data, error: null }, init)
}

/** 실패 응답 (기본 400). data 는 null, error 는 사용자 안전 메시지. */
export function fail(error: string, status = 400): NextResponse {
  return NextResponse.json<ApiEnvelope<null>>({ ok: false, data: null, error }, { status })
}
