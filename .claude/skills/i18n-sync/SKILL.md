---
name: i18n-sync
description: i18n 로케일 키와 이모지 토큰 변경 시 전 계층 동기화 패턴
evolved_from:
  - emoji-full-layer-sync
  - locale-key-sync
  - i18n-audit-script
---

# i18n-sync Skill

로케일 키 또는 이모지 토큰을 변경할 때 누락 없이 전 계층을 동기화하는 패턴.

## 규칙 1: 로케일 키는 ko + en-US 동시 수정

로케일 키를 추가하거나 수정할 때 반드시 `ko`와 `en-US` 파일을 **동시에** 업데이트한다.

```
apps/bot/src/locales/ko/{embeds,common,game}.json
apps/bot/src/locales/en-US/{embeds,common,game}.json
```

한쪽만 수정하면 i18n 검증이 실패한다.

## 규칙 2: 이모지 토큰 변경 시 전파 순서

이모지(시각적 토큰)를 변경하면 아래 순서로 **모든 계층에 전파**한다:

1. 렌더러 상수 (예: `LandRenderer.ts`의 `EMPTY_CELL`)
2. 로케일 파일 (ko, en-US 모두)
3. 커맨드 버튼 라벨
4. 테스트 어서션 → 실행 검증

## 규칙 3: 번역 수정 후 보간값 오딧

`t()` 호출이 참조하는 키를 수정한 뒤 커스텀 오딧 스크립트로 누락된 보간값(interpolation)을 자동 감지한다.

```bash
# 누락 보간값 감지 예시
grep -r "t('some.key'" apps/bot/src --include="*.ts" | \
  node scripts/audit-i18n.js
```

오딧 스크립트를 생략하면 런타임에서 `{{variable}}` 미치환 문자열이 노출된다.
