/**
 * `/land view` Prev/Next 네비게이션 순수 헬퍼.
 *
 * DB/discord.js 의존 없음. 정렬된 owned index 배열과 현재 index만으로
 * 양옆 이동 대상 번호를 계산한다.
 */

/** 정렬된 owned index 배열에서 `current` 바로 앞 소유 index. 없으면 `null`. */
export function prevOwnedIndex(
  ownedSorted: ReadonlyArray<number>,
  current: number
): number | null {
  let result: number | null = null
  for (const i of ownedSorted) {
    if (i < current) result = i
    else break
  }
  return result
}

/** 정렬된 owned index 배열에서 `current` 바로 뒤 소유 index. 없으면 `null`. */
export function nextOwnedIndex(
  ownedSorted: ReadonlyArray<number>,
  current: number
): number | null {
  for (const i of ownedSorted) {
    if (i > current) return i
  }
  return null
}
