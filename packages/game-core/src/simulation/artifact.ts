/**
 * 아티팩트 이름 규칙.
 *
 * CI 가 업로드하는 산출물 묶음의 이름은 `[브랜치]-[커밋 해시]` 형식이다.
 * 실행 스크립트와 CI 워크플로 양쪽이 같은 규칙을 써야 하므로 순수 함수로
 * 떼어 두고 테스트로 고정한다.
 */

/** 커밋 해시를 줄일 자릿수 — git 관례의 짧은 해시. */
export const SHORT_COMMIT_LENGTH = 7

/**
 * 브랜치명을 파일명에 쓸 수 있게 정리한다.
 *
 * `feat/economy-sim` 처럼 `/` 가 든 브랜치명을 그대로 쓰면 경로 구분자로
 * 해석되어 아티팩트가 중첩 디렉터리로 올라간다. 경로·파일명 금지 문자와
 * 공백을 전부 `-` 로 접고 연속된 `-` 를 하나로 줄인다.
 *
 * @param branch 원본 브랜치명
 * @returns 파일명에 안전한 문자열 (비면 `unknown`)
 */
export function sanitizeBranch(branch: string): string {
  const safe = branch
    .replace(/[/\\:*?"<>|\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
  return safe || 'unknown'
}

/**
 * 아티팩트 이름을 만든다 — `[브랜치]-[커밋 해시]`.
 *
 * @param branch 브랜치명 (슬래시 포함 가능)
 * @param commit 커밋 해시 (전체 또는 짧은 형식)
 * @returns 아티팩트 이름
 */
export function artifactName(branch: string, commit: string): string {
  const short = (commit || 'unknown').slice(0, SHORT_COMMIT_LENGTH)
  return `${sanitizeBranch(branch)}-${short}`
}
