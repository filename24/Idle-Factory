/**
 * 뮤테이션 레이트 리밋.
 *
 * better-auth 에도 레이트 리밋이 있지만 그건 **better-auth 자신의 라우트**
 * (`/api/auth/*`)에만 걸린다. Server Action 은 그 경로를 타지 않으므로 별도
 * 구현이 필요하다.
 *
 * 고정 윈도(fixed window)를 쓴다. 슬라이딩 윈도보다 경계에서 최대 2배까지
 * 통과할 수 있지만, 여기 목적은 정밀한 쿼터 과금이 아니라 **연타·자동화 방지**라
 * 그 정도 오차는 무해하다. 대신 구현이 단순해 Redis 왕복 2회로 끝난다.
 */

/**
 * Redis 저장소가 실제로 쓰는 명령만 추린 구조적 타입.
 *
 * `ioredis` 를 웹의 직접 의존으로 올리지 않기 위한 선택이다 — 지금 웹은
 * `useRedis: false` 로 `DatabaseClient` 를 만들고 있어 Redis 클라이언트가 아예
 * 없다. 타입 하나 때문에 런타임 의존을 추가하면 번들 추적 대상만 늘어난다.
 * ioredis 인스턴스는 이 형태를 구조적으로 만족한다.
 */
export interface RedisLike {
  incr(key: string): Promise<number>
  pexpire(key: string, milliseconds: number): Promise<unknown>
  pttl(key: string): Promise<number>
}

/** 리밋 규칙. */
export interface RateLimitRule {
  /** 버킷 식별자 — 보통 뮤테이션 이름(`land.buy`). */
  readonly bucket: string
  /** 윈도 내 허용 횟수. */
  readonly limit: number
  /** 윈도 길이(밀리초). */
  readonly windowMs: number
}

/** 리밋 판정 결과. */
export interface RateLimitVerdict {
  readonly allowed: boolean
  /** 남은 허용 횟수(0 이상). */
  readonly remaining: number
  /** 현재 윈도가 끝나는 시각(epoch ms). */
  readonly resetAtMs: number
}

/** 카운터 저장소. */
export interface RateLimitStore {
  /**
   * 키의 카운터를 1 증가시키고 현재값과 윈도 종료 시각을 돌려준다.
   *
   * @param key 카운터 키
   * @param windowMs 윈도 길이
   */
  hit(key: string, windowMs: number): Promise<{ count: number; resetAtMs: number }>
}

/**
 * 프로세스 메모리 기반 저장소.
 *
 * **프로세스마다 카운터가 따로 논다.** 웹을 수평 확장하면 실효 한도가 replica
 * 수만큼 곱해진다. 현재 배포는 단일 컨테이너(`output: 'standalone'`)라 문제가
 * 없지만, replica 를 늘리는 순간 Redis 저장소로 바꿔야 한다.
 *
 * @param now 시계 주입 — 테스트에서 윈도 롤오버를 결정론적으로 만들기 위함
 */
export function createMemoryStore(now: () => number = Date.now): RateLimitStore {
  const buckets = new Map<string, { count: number; resetAtMs: number }>()

  return {
    async hit(key, windowMs) {
      const current = now()
      const existing = buckets.get(key)

      if (!existing || existing.resetAtMs <= current) {
        const fresh = { count: 1, resetAtMs: current + windowMs }
        buckets.set(key, fresh)
        // 만료 항목이 무한정 쌓이지 않도록 접근 시점에 청소한다.
        if (buckets.size > 10_000) {
          for (const [k, v] of buckets) if (v.resetAtMs <= current) buckets.delete(k)
        }
        return { ...fresh }
      }

      existing.count += 1
      return { ...existing }
    },
  }
}

/**
 * Redis 기반 저장소.
 *
 * `INCR` 후 첫 증가일 때만 `PEXPIRE` 를 건다. 순서가 반대면 TTL 이 매번
 * 갱신돼 윈도가 영원히 끝나지 않는다.
 *
 * @param redis {@link RedisLike} 를 만족하는 클라이언트(ioredis 인스턴스 등)
 */
export function createRedisStore(redis: RedisLike): RateLimitStore {
  return {
    async hit(key, windowMs) {
      const count = await redis.incr(key)
      if (count === 1) await redis.pexpire(key, windowMs)

      const ttl = await redis.pttl(key)
      // pttl 이 -1(만료 없음)/-2(키 없음)를 주는 경쟁 상황에서는 보수적으로
      // 지금부터 한 윈도로 본다.
      const resetAtMs = ttl > 0 ? Date.now() + ttl : Date.now() + windowMs
      return { count, resetAtMs }
    },
  }
}

/** 프로세스 전역 폴백 저장소 — 모듈 로드 시 한 번만 만든다. */
const memoryStore = createMemoryStore()

/**
 * 리밋을 검사한다.
 *
 * @param rule 적용할 규칙
 * @param subject 주체 식별자(보통 게임 User.id, 미인증 경로면 IP)
 * @param store 저장소. 생략하면 프로세스 메모리 저장소
 */
export async function checkRateLimit(
  rule: RateLimitRule,
  subject: string,
  store: RateLimitStore = memoryStore,
): Promise<RateLimitVerdict> {
  const { count, resetAtMs } = await store.hit(`rl:${rule.bucket}:${subject}`, rule.windowMs)
  return {
    allowed: count <= rule.limit,
    remaining: Math.max(0, rule.limit - count),
    resetAtMs,
  }
}
