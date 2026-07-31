/**
 * `ServiceError` → HTTP·i18n 매핑 검증.
 *
 * 가장 중요한 두 가지:
 *  1. 구조 판정(`isServiceError`)이 번들 realm 이 갈린 상황에서도 동작하는가 —
 *     실제 클래스 인스턴스가 아닌 순수 객체 리터럴로 검증한다.
 *  2. 모든 매핑의 메시지 키가 ko·en 양쪽 카탈로그에 실재하는가 — 이게 봇과
 *     웹의 에러 목록이 어긋나는 걸 막는 마지막 방어선이다.
 */

import { describe, expect, it } from 'vitest'
import en from '../../messages/en.json'
import ko from '../../messages/ko.json'
import {
  SERVICE_ERROR_MAP,
  extractParams,
  isServiceError,
  mapServiceError,
} from '../../src/lib/mutation/errors'
import { INFRA_ERROR_MAP } from '../../src/lib/mutation/result'

/** `a.b.c` 경로로 중첩 카탈로그를 조회한다. */
function lookup(catalog: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (node, key) =>
        node !== null && typeof node === 'object'
          ? (node as Record<string, unknown>)[key]
          : undefined,
      catalog,
    )
}

describe('isServiceError', () => {
  it('다른 realm 에서 온 순수 객체도 인식한다', () => {
    // instanceof 를 쓰면 여기서 실패한다 — 워크스페이스 패키지 경계를 넘으면
    // 클래스 신원이 깨질 수 있어 구조 판정을 쓰는 이유다.
    expect(isServiceError({ name: 'ServiceError', code: 'INSUFFICIENT_MONEY' })).toBe(true)
  })

  it('평범한 Error 는 거부한다', () => {
    expect(isServiceError(new Error('boom'))).toBe(false)
  })

  it('null·문자열·code 없는 객체를 거부한다', () => {
    expect(isServiceError(null)).toBe(false)
    expect(isServiceError('ServiceError')).toBe(false)
    expect(isServiceError({ name: 'ServiceError' })).toBe(false)
    expect(isServiceError({ code: 'INSUFFICIENT_MONEY' })).toBe(false)
  })
})

describe('SERVICE_ERROR_MAP', () => {
  it('모든 항목이 유효한 HTTP 상태를 갖는다', () => {
    for (const [code, entry] of Object.entries(SERVICE_ERROR_MAP)) {
      expect(entry.status, code).toBeGreaterThanOrEqual(400)
      expect(entry.status, code).toBeLessThan(600)
    }
  })

  it('상태 코드 배분이 의도대로다', () => {
    expect(SERVICE_ERROR_MAP.FACTORY_NOT_FOUND.status).toBe(404)
    expect(SERVICE_ERROR_MAP.NOT_LISTING_OWNER.status).toBe(403)
    expect(SERVICE_ERROR_MAP.MAX_LANDS.status).toBe(409)
    expect(SERVICE_ERROR_MAP.STOCK_RATE_LIMITED.status).toBe(429)
    expect(SERVICE_ERROR_MAP.INSUFFICIENT_MONEY.status).toBe(400)
  })

  it('상장 공장 철거 차단은 409 로 매핑된다', () => {
    // 감사에서 웹 미구현으로 확인된 가드 — 웹 뮤테이션에서도 살아 있어야 한다.
    expect(SERVICE_ERROR_MAP.FACTORY_LISTED.status).toBe(409)
  })

  it('모든 메시지 키가 ko·en 양쪽에 실재한다', () => {
    const entries = [...Object.entries(SERVICE_ERROR_MAP), ...Object.entries(INFRA_ERROR_MAP)]

    for (const [code, entry] of entries) {
      expect(lookup(ko, entry.messageKey), `ko: ${code}`).toBeTypeOf('string')
      expect(lookup(en, entry.messageKey), `en: ${code}`).toBeTypeOf('string')
    }
  })
})

describe('extractParams', () => {
  it('스칼라만 남기고 객체·함수는 버린다', () => {
    const params = extractParams({
      limit: 20,
      tier: 'RESTRICTED',
      nested: { leaked: true },
      fn: () => undefined,
    })
    expect(params).toEqual({ limit: 20, tier: 'RESTRICTED' })
  })

  it('bigint 를 문자열로 바꾼다', () => {
    expect(extractParams({ cost: 1_000_000n })).toEqual({ cost: '1000000' })
  })

  it('쓸 값이 없으면 undefined 를 준다', () => {
    expect(extractParams(undefined)).toBeUndefined()
    expect(extractParams(null)).toBeUndefined()
    expect(extractParams({})).toBeUndefined()
    expect(extractParams({ only: { objects: 1 } })).toBeUndefined()
    expect(extractParams([1, 2])).toBeUndefined()
  })
})

describe('mapServiceError', () => {
  it('도메인 에러를 코드·상태·키로 정규화한다', () => {
    const failure = mapServiceError({
      name: 'ServiceError',
      code: 'INSUFFICIENT_MONEY',
      details: { required: 5_000n },
    })

    expect(failure).toEqual({
      ok: false,
      code: 'INSUFFICIENT_MONEY',
      status: 400,
      messageKey: 'game.errors.INSUFFICIENT_MONEY',
      params: { required: '5000' },
    })
  })

  it('알 수 없는 에러는 INTERNAL 로 뭉개고 원문을 노출하지 않는다', () => {
    const failure = mapServiceError(new Error('DB password is hunter2'))

    expect(failure.code).toBe('INTERNAL')
    expect(failure.status).toBe(500)
    expect(JSON.stringify(failure)).not.toContain('hunter2')
  })

  it('정의되지 않은 코드가 와도 INTERNAL 로 안전하게 떨어진다', () => {
    // 런타임에 버전이 어긋난 패키지가 물린 상황을 흉내낸다.
    const failure = mapServiceError({ name: 'ServiceError', code: 'FROM_THE_FUTURE' })
    expect(failure.code).toBe('INTERNAL')
  })
})
