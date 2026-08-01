# 01. 프로젝트 개요

## 소개

모바일 게임 Idle Tycoon 모티브로 제작된 Discord 봇. 유저가 공장을 건설해 자재와 돈을 자동 생산하고, 유저 간 거래·주식·글로벌 경제 시스템에 참여하는 멀티서버 경제 시뮬레이션 게임.

## 주요 특징

- 빗금 명령어(`/`) 전용
- 현실 경제 시스템 (수요·공급에 따른 자재 가격 변동)
- 멀티 서버 글로벌 경제 (서버 단위 신뢰도/세금)
- i18n 지원 (한국어/영어, 유저·서버 단위 언어 설정)

> **코드 기준**: `apps/bot/src/utils/language.ts` 의 `SUPPORTED_LANGUAGES`(`ko`, `en-US`)와 `resolveLanguage()` 가 유저/서버 우선순위 언어 리졸버를 구현하며, `/language` 명령(`apps/bot/src/commands/settings/language.ts` 의 `LanguageCommand`)으로 노출된다. 웹은 `apps/web/src/i18n/config.ts` 의 `LOCALES`(`ko`, `en`)와 `resolveLocale()`, `LocaleSwitcher.tsx` 가 동일 기능을 제공한다.

## 핵심 컨셉

```mermaid
flowchart LR
    A[유저] -->|건설| B[공장]
    B -->|자동 생산| C[자재 + 돈]
    C -->|투자| D[업그레이드/신공장]
    C -->|거래| E[유저 마켓]
    C -->|투자| F[주식]
    E --> G[글로벌 경제]
    F --> G
    G -->|신뢰도| H[서버 전체 혜택/패널티]
```
