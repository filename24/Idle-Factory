import { test, expect } from './fixtures'

/**
 * 하이드레이션 불일치 회귀 방지.
 *
 * HeaderAuth 는 루트 레이아웃 전역에 깔리는 클라이언트 아일랜드다. better-auth 의
 * `useSession` 은 `useSyncExternalStore(subscribe, get, get)` 로 서버 스냅샷과
 * 클라이언트 스냅샷에 같은 함수를 쓰고, 세션 fetch 는 모듈 로드 즉시 시작된다.
 * 그래서 세션 응답이 하이드레이션보다 먼저 도착하면 첫 클라이언트 렌더가
 * `isPending: false` 로 계산돼 SSR 이 그린 스켈레톤과 어긋난다.
 *
 * 이 경합은 하이드레이션이 느릴수록 잘 터진다(번들이 큰 /docs 에서 실제 발생).
 * 그래서 CPU 를 조여 하이드레이션을 반드시 지게 만들어 결정론적으로 재현한다.
 */
const CPU_THROTTLE_RATE = 8

const PAGES_WITH_HEADER = ['/', '/docs', '/ranking', '/login']

for (const path of PAGES_WITH_HEADER) {
  test(`${path} 에서 하이드레이션 불일치가 발생하지 않는다`, async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })
    page.on('pageerror', (err) => errors.push(err.message))

    // 세션 응답을 즉시 돌려주고(네트워크·DB 지연 제거) 하이드레이션은 CPU 를 조여
    // 늦춘다. 두 조작으로 "세션이 먼저 도착하는" 경합을 항상 재현한다.
    await page.route('**/api/auth/get-session*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: 'null' }),
    )
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE_RATE })

    await page.goto(path)
    await page.waitForLoadState('networkidle')
    // 하이드레이션이 끝나야 판정할 수 있다 — 헤더의 인증 영역이 확정될 때까지 기다린다.
    await expect(page.getByRole('button', { name: '로그인' }).first()).toBeVisible()

    const hydrationErrors = errors.filter((text) => /hydrat|didn't match|did not match/i.test(text))
    expect(hydrationErrors, `하이드레이션 오류:\n${hydrationErrors.join('\n---\n')}`).toEqual([])
  })
}
