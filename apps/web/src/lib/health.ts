/** `GET /api/health` 응답 본문. */
export interface HealthPayload {
  /** 프로세스가 요청을 처리 중이면 항상 'ok'. 실패는 응답 자체가 안 나가는 것으로 표현된다. */
  readonly status: 'ok'
  /** 배포된 이미지 식별자. Dockerfile 이 커밋 SHA 를 BUILD_NUMBER 로 주입한다. */
  readonly version: string
  /** 프로세스 가동 시간(초, 정수). 재시작 루프를 눈으로 확인하는 데 쓴다. */
  readonly uptimeSeconds: number
}

/**
 * 컨테이너 오케스트레이터용 liveness 페이로드를 만든다.
 *
 * DB·Redis 를 의도적으로 확인하지 않는다. 의존성까지 검사하면 DB 가 잠깐
 * 흔들릴 때 web 컨테이너가 unhealthy 로 떨어져 재시작 루프에 빠지는데,
 * 재시작은 DB 장애를 고치지 못한다. 각 의존성 상태는 해당 컨테이너의
 * 자체 healthcheck(postgres 는 `pg_isready`)가 판정한다.
 *
 * @param uptimeSeconds `process.uptime()` 값(소수 초).
 * @param version 이미지 식별자. 이미지에 `.git` 이 없어 주입을 빠뜨리면 undefined 가 들어온다.
 */
export function buildHealthPayload(
  uptimeSeconds: number,
  version: string | undefined,
): HealthPayload {
  return {
    status: 'ok',
    version: version && version.length > 0 ? version : 'unknown',
    uptimeSeconds: Math.max(0, Math.floor(uptimeSeconds)),
  }
}
