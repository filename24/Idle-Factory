/**
 * `UserService.updateLang` 유닛 테스트.
 *
 * 개인 언어 설정의 유일한 쓰기 경로. `User.lang` 은 지원 로케일이거나
 * `'auto'`(서버 설정 따름) 둘 중 하나만 될 수 있다 — 그 밖의 값이 들어가면
 * `utils/language` 리졸버가 조용히 무시해 "바꿨는데 안 바뀌는" 상태가 된다.
 * 그래서 저장 경계에서 막는다.
 *
 * Prisma 는 목으로 대체하므로 DB 없이 돌아간다.
 */

import { describe, expect, it, vi } from 'vitest'
import { ServiceError } from '../../src/services/base'
import { UserService } from '../../src/services/user'
import { LANG_AUTO } from '../../src/utils/language'

/** `updateLang` 이 실제로 쓰는 두 메서드만 흉내 내는 Prisma 목. */
function createDb(existing: { id: string } | null) {
  return {
    user: {
      findUnique: vi.fn().mockResolvedValue(existing),
      update: vi.fn(({ data }: { data: { lang: string } }) =>
        Promise.resolve({ id: 'u1', lang: data.lang })
      )
    }
  }
}

describe('UserService.updateLang — 정상 경로', () => {
  it('지원 로케일로 변경하고 갱신된 row 를 반환한다', async () => {
    const db = createDb({ id: 'u1' })

    const updated = await UserService.updateLang(db as never, 'u1', 'en-US')

    expect(updated.lang).toBe('en-US')
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { lang: 'en-US' }
    })
  })

  it("'auto' 로 되돌려 서버 설정을 따르게 할 수 있다", async () => {
    const db = createDb({ id: 'u1' })

    const updated = await UserService.updateLang(db as never, 'u1', LANG_AUTO)

    expect(updated.lang).toBe(LANG_AUTO)
  })
})

describe('UserService.updateLang — 입력 검증', () => {
  it('번역 리소스가 없는 로케일은 거부하고 쓰기를 시도하지 않는다', async () => {
    const db = createDb({ id: 'u1' })

    await expect(
      UserService.updateLang(db as never, 'u1', 'fr')
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_LANGUAGE' })
    expect(db.user.update).not.toHaveBeenCalled()
  })

  it('빈 문자열도 거부한다', async () => {
    const db = createDb({ id: 'u1' })

    await expect(
      UserService.updateLang(db as never, 'u1', '')
    ).rejects.toBeInstanceOf(ServiceError)
    expect(db.user.update).not.toHaveBeenCalled()
  })

  it('유저 row 가 없으면 USER_NOT_FOUND 로 실패한다', async () => {
    const db = createDb(null)

    await expect(
      UserService.updateLang(db as never, 'ghost', 'ko')
    ).rejects.toMatchObject({ code: 'USER_NOT_FOUND' })
    expect(db.user.update).not.toHaveBeenCalled()
  })

  it('검증은 존재 확인보다 먼저 수행한다 — 잘못된 입력에 조회를 낭비하지 않는다', async () => {
    const db = createDb(null)

    await expect(
      UserService.updateLang(db as never, 'ghost', 'fr')
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_LANGUAGE' })
    expect(db.user.findUnique).not.toHaveBeenCalled()
  })
})
