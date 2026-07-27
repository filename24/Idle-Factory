import { describe, test, expect } from 'vitest'
import { buildHealthPayload } from '../../src/lib/health'

/**
 * 컨테이너 오케스트레이터(compose healthcheck)가 소비하는 liveness 페이로드 검증.
 * 프로브는 DB 를 건드리지 않는다 — DB 장애로 web 컨테이너가 재시작 루프에
 * 빠지면 안 되기 때문이다(DB 상태는 postgres 컨테이너 자체 healthcheck 담당).
 */
describe('buildHealthPayload', () => {
  test('주입된 uptime·version 을 그대로 담는다', () => {
    const payload = buildHealthPayload(1234, 'a1b2c3d')

    expect(payload).toEqual({ status: 'ok', version: 'a1b2c3d', uptimeSeconds: 1234 })
  })

  test('uptime 소수점을 초 단위로 내린다', () => {
    // process.uptime() 은 소수 초를 반환한다. 응답을 정수로 고정해야
    // 프로브 로그 diff 가 매초 흔들리지 않는다.
    expect(buildHealthPayload(12.98, 'x').uptimeSeconds).toBe(12)
  })

  test('version 이 비었으면 unknown 으로 대체한다', () => {
    // 이미지에 .git 이 없어 BUILD_NUMBER 주입을 빠뜨리면 undefined 가 들어온다.
    expect(buildHealthPayload(1, undefined).version).toBe('unknown')
    expect(buildHealthPayload(1, '').version).toBe('unknown')
  })

  test('음수 uptime 을 0 으로 잡아둔다', () => {
    // 방어적 하한선 — 프로브 응답에 음수 uptime 이 나가지 않게 한다.
    expect(buildHealthPayload(-5, 'x').uptimeSeconds).toBe(0)
  })
})
