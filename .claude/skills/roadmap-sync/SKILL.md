---
name: roadmap-sync
description: GitHub 로드맵 이슈를 실제 코드베이스 기준으로 동기화한다. 구현된 항목 체크, 미완료 항목을 서브이슈로 생성(Plan 에이전트 병렬 실행), 체크리스트 옆에 이슈 번호 인라인 연결까지 수행. TRIGGER: "로드맵 업데이트", "이슈 동기화", "미완료 이슈 추가" 요청 시.
---

# roadmap-sync

GitHub 로드맵 이슈를 코드 현황에 맞게 동기화하는 3단계 워크플로우.

## 단계 1 — 현황 파악 (병렬)

다음을 동시에 수집한다:

1. `gh issue view <roadmap_issue_number>` — 현재 로드맵 본문
2. 코드베이스 탐색 — 구현된 커맨드·서비스·패키지 목록
3. `git log --oneline -20` — 최근 커밋으로 완료 범위 보정

## 단계 2 — 로드맵 이슈 업데이트

수집한 코드 현황을 바탕으로:

- 구현 완료된 항목 → `- [ ]` 를 `- [x]` 로 변경
- 스키마 모델 수, 패키지 목록 등 수치 정보 정정
- Phase 제목에 `✅ 완료` 표시 추가
- `gh issue edit <number> --body "..."` 로 반영

## 단계 3 — 미완료 항목 서브이슈 생성

### 그룹핑 기준

- 같은 Phase 내 연관 기능은 하나의 이슈로 묶는다
- 독립적으로 구현 가능한 기능은 분리한다

### 병렬 처리

각 그룹마다 **Plan 에이전트를 동시에 실행**해 구현 플랜을 작성받는다:

```
Agent(subagent_type="Plan", prompt="...현황 + 미구현 범위 + 스택...")
```

Plan 에이전트 프롬프트에 반드시 포함할 것:

- 이미 존재하는 스키마·서비스·파일 현황
- 미구현 범위의 정확한 경계
- 프로젝트 기술 스택 (Sapphire.js / Next.js / Prisma 등)
- "GitHub 이슈 본문용 간략한 참고 플랜, 흐름만" 명시

### 이슈 본문 형식

```markdown
> ⚠️ 참고용 플랜입니다. 실제 구현 시 코드베이스 상황에 따라 조정하세요.

## 개요

(한 줄 요약)

## 현황

(이미 존재하는 스키마·서비스 등)

## 구현 흐름

(Plan 에이전트 결과 기반, 핵심 단계만)

## 의존 순서

(단계 간 순서)

## 관련 파일

(수정/신설 대상 파일 목록)
```

### 서브이슈 연결

이슈 생성 후 GraphQL mutation으로 부모 이슈에 서브이슈 등록:

```bash
# 1. 부모 이슈 node ID 조회
gh api graphql -f query='{
  repository(owner: "OWNER", name: "REPO") {
    issue(number: PARENT_NUM) { id }
  }
}'

# 2. 자식 이슈 node ID 일괄 조회
gh api graphql -f query='{
  repository(owner: "OWNER", name: "REPO") {
    i14: issue(number: 14) { id }
    i15: issue(number: 15) { id }
  }
}'

# 3. 서브이슈 등록 (이슈마다 반복)
gh api graphql -f query="
mutation {
  addSubIssue(input: {
    issueId: \"<parent_node_id>\",
    subIssueId: \"<child_node_id>\"
  }) { issue { number } subIssue { number } }
}"
```

### 체크리스트 인라인 연결

생성된 이슈 번호를 로드맵 체크리스트 항목 바로 옆에 붙인다:

```markdown
- [ ] 마켓 구매 / 취소 / 만료 처리 #14
- [ ] 글로벌 마켓 가격 변동 알고리즘 #15
```

별도 테이블이나 하단 섹션으로 분리하지 않는다.
