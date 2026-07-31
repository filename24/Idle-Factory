import { describe, expect, it } from 'vitest'
import type { TFunction } from 'i18next'
import {
  buildProfileWarehouseSection,
  stackLines,
  visibleStacks
} from '../../src/utils/warehouseDisplay'
import type { StackLike } from '../../src/utils/warehouseDisplay'

/**
 * 키를 그대로 반환하되 보간값은 `key{a=1}` 형태로 덧붙이는 가짜 t 함수.
 *
 * 어떤 로케일 키가 참조됐고 어떤 값이 넘어갔는지 함께 검증하기 위해 사용한다.
 */
const fakeT = ((key: string, opts?: Record<string, unknown>) => {
  if (!opts) return key
  const args = Object.entries(opts)
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(',')
  return `${key}{${args}}`
}) as unknown as TFunction

const stack = (material: StackLike['material'], count: bigint): StackLike => ({
  material,
  count
})

describe('visibleStacks', () => {
  it('drops zero-count rows left behind by material consumption', () => {
    const result = visibleStacks([
      stack('GRAIN', 0n),
      stack('ORE', 5n),
      stack('WOOD', 0n)
    ])

    expect(result).toEqual([stack('ORE', 5n)])
  })

  it('sorts by material declaration order regardless of input order', () => {
    const result = visibleStacks([
      stack('RAW_BOOSTER', 1n),
      stack('CAR', 2n),
      stack('GRAIN', 3n),
      stack('STEEL', 4n)
    ])

    expect(result.map((s) => s.material)).toEqual([
      'GRAIN',
      'STEEL',
      'CAR',
      'RAW_BOOSTER'
    ])
  })

  it('does not mutate the input array', () => {
    const input = [stack('CAR', 1n), stack('GRAIN', 1n)]

    visibleStacks(input)

    expect(input.map((s) => s.material)).toEqual(['CAR', 'GRAIN'])
  })
})

describe('stackLines', () => {
  it('localizes the material and formats the count with thousand separators', () => {
    expect(stackLines(fakeT, [stack('GRAIN', 1_234_567n)])).toEqual([
      '• game:material.GRAIN{defaultValue=GRAIN}: 1,234,567'
    ])
  })

  it('returns an empty array when nothing is stored', () => {
    expect(stackLines(fakeT, [])).toEqual([])
    expect(stackLines(fakeT, [stack('GRAIN', 0n)])).toEqual([])
  })
})

describe('buildProfileWarehouseSection', () => {
  it('shows used/capacity in slots and lists every material', () => {
    const section = buildProfileWarehouseSection(fakeT, 1, [
      stack('GRAIN', 100n),
      stack('ORE', 50n)
    ])

    expect(section.body).toContain('game:warehouse.view.fields.stacks')
    // ORE 는 부피 계수 2 라 50 개 = 100 슬롯. 100 + 100 = 200.
    expect(section.body).toContain('used=200')
    expect(section.body).toContain('capacity=3,000')
    expect(section.body).toContain('game:material.GRAIN')
    expect(section.body).toContain('game:material.ORE')
    expect(section.footer).toBeUndefined()
  })

  it('falls back to the empty message when no material is stored', () => {
    const section = buildProfileWarehouseSection(fakeT, 2, [stack('GRAIN', 0n)])

    expect(section.body).toContain('game:warehouse.view.empty')
    expect(section.footer).toBeUndefined()
  })

  it('omits the capacity part instead of throwing on an out-of-range grade', () => {
    for (const grade of [0, 11]) {
      const section = buildProfileWarehouseSection(fakeT, grade, [
        stack('GRAIN', 1n)
      ])

      expect(section.body).toContain('game:warehouse.view.fields.stacks')
      expect(section.body).not.toContain('game:warehouse.view.slots')
      expect(section.body).toContain('game:material.GRAIN')
    }
  })

  it('drops every line and reports all of them when the budget fits nothing', () => {
    const section = buildProfileWarehouseSection(
      fakeT,
      1,
      [stack('GRAIN', 1n), stack('ORE', 1n), stack('WOOD', 1n)],
      1
    )

    expect(section.body).not.toContain('game:material.GRAIN')
    expect(section.footer).toContain('game:profile.warehouseMore')
    expect(section.footer).toContain('count=3')
  })

  it('shows as many lines as the budget allows and reports only the rest', () => {
    const stacks = [stack('GRAIN', 1n), stack('ORE', 1n), stack('WOOD', 1n)]
    const lines = stackLines(fakeT, stacks)
    // 앞 두 줄이 정확히 들어차고 세 번째 줄은 못 들어가는 예산.
    // 줄마다 예산을 깎지 않으면 세 줄 모두 통과해 이 단언이 깨진다.
    const budget = lines[0]!.length + 1 + lines[1]!.length + 1

    const section = buildProfileWarehouseSection(fakeT, 1, stacks, budget)

    expect(section.body).toContain('game:material.GRAIN')
    expect(section.body).toContain('game:material.ORE')
    expect(section.body).not.toContain('game:material.WOOD')
    expect(section.footer).toContain('count=1')
  })
})
