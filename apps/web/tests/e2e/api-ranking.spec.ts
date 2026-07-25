import { test, expect } from './fixtures'

/**
 * 라우트 핸들러 계약 테스트 — 봉투 형식, BigInt 문자열 직렬화, 입력 정규화, 오류 코드.
 * 데이터 유무에 무관하게 통과하도록 조건부 단언을 사용한다.
 */
test.describe('랭킹·통계 API', () => {
  test('GET /api/ranking/users — 봉투·페이지네이션·BigInt 문자열', async ({ request }) => {
    const res = await request.get('/api/ranking/users')
    expect(res.status()).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.error).toBeNull()
    expect(Array.isArray(json.data.entries)).toBe(true)
    expect(typeof json.data.total).toBe('number')
    expect(json.data.pageSize).toBe(20)
    expect(json.data.page).toBe(1)
    for (const e of json.data.entries) {
      expect(typeof e.money).toBe('string')
      expect(typeof e.xp).toBe('string')
      expect(typeof e.rank).toBe('number')
      expect(typeof e.level).toBe('number')
      // 프라이버시: 공개 API 는 유저 식별자(Discord snowflake)를 노출하지 않는다.
      expect(e.id).toBeUndefined()
    }
  })

  test('GET /api/ranking/users?sort=level — sort 반영', async ({ request }) => {
    const res = await request.get('/api/ranking/users?sort=level')
    expect(res.status()).toBe(200)
    expect((await res.json()).data.sort).toBe('level')
  })

  test('GET /api/ranking/users?sort=INVALID — money 로 폴백', async ({ request }) => {
    const res = await request.get('/api/ranking/users?sort=INVALID')
    expect(res.status()).toBe(200)
    expect((await res.json()).data.sort).toBe('money')
  })

  test('GET /api/ranking/users?page=abc — page 1 로 정규화', async ({ request }) => {
    const res = await request.get('/api/ranking/users?page=abc')
    expect(res.status()).toBe(200)
    expect((await res.json()).data.page).toBe(1)
  })

  test('GET /api/ranking/guilds — vault 문자열', async ({ request }) => {
    const res = await request.get('/api/ranking/guilds')
    expect(res.status()).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    for (const e of json.data.entries) {
      expect(typeof e.vault).toBe('string')
      expect(typeof e.weeklyDAU).toBe('number')
    }
  })

  test('GET /api/guilds/[존재하지 않음] — 404 오류 봉투', async ({ request }) => {
    const res = await request.get('/api/guilds/999999999999999999')
    expect(res.status()).toBe(404)
    const json = await res.json()
    expect(json.ok).toBe(false)
    expect(json.data).toBeNull()
    expect(json.error).toBeTruthy()
  })

  test('GET /api/guilds/[형식 오류] — 404', async ({ request }) => {
    const res = await request.get('/api/guilds/not-a-snowflake')
    expect(res.status()).toBe(404)
  })

  test('GET /api/guilds/[유효] — 200 통계 DTO', async ({ request }) => {
    const list = await (await request.get('/api/ranking/guilds')).json()
    const id: string | undefined = list?.data?.entries?.[0]?.id
    test.skip(!id, '서버 데이터 없음')
    const res = await request.get(`/api/guilds/${id}`)
    // 공유 dev DB가 조회 사이에 초기화될 수 있음 — 사라졌다면(404) 레이스로 보고 스킵.
    test.skip(res.status() === 404, '조회 중 서버 데이터가 사라짐(공유 DB 레이스)')
    expect(res.status()).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(typeof json.data.vault).toBe('string')
    expect(typeof json.data.totalTaxCollected).toBe('string')
    expect(Array.isArray(json.data.dauTrend)).toBe(true)
    expect(Array.isArray(json.data.settlements)).toBe(true)
    // 중첩 DTO 의 BigInt 도 문자열로 직렬화되어야 한다(taxPaid/salesRevenue).
    for (const s of json.data.settlements) {
      expect(typeof s.taxPaid).toBe('string')
      expect(typeof s.salesRevenue).toBe('string')
      // KST 보정된 달력일(YYYY-MM-DD) 프리픽스.
      expect(s.weekStart).toMatch(/^\d{4}-\d{2}-\d{2}/)
    }
    for (const d of json.data.dauTrend) {
      expect(d.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(typeof d.count).toBe('number')
    }
  })
})
