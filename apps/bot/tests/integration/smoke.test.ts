import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeDb, resetDb, testPrisma } from './setup'

describe('integration smoke', () => {
  beforeAll(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await closeDb()
  })

  it('connects to the dev database and round-trips a User row', async () => {
    const id = 'smoke-test-user-1'

    const created = await testPrisma.user.create({
      data: { id, nickname: 'smoke' }
    })

    expect(created.id).toBe(id)
    expect(created.nickname).toBe('smoke')
    expect(created.level).toBe(1)

    const found = await testPrisma.user.findUnique({ where: { id } })
    expect(found).not.toBeNull()
    expect(found?.id).toBe(id)
    expect(found?.nickname).toBe('smoke')
  })
})
