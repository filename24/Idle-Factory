# Idle Factory — 설계 문서

Idle Tycoon 모티브로 제작된 Discord 봇. 공장 운영 + 현실 경제 시뮬레이션.

## 문서 구조

| 문서                                                  | 내용                               |
| ----------------------------------------------------- | ---------------------------------- |
| [00-onboarding.md](./design/00-onboarding.md)         | 온보딩 · 초반 스타팅 · 자재 기준가 |
| [01-overview.md](./design/01-overview.md)             | 프로젝트 개요 및 특징              |
| [02-core-loop.md](./design/02-core-loop.md)           | 게임 코어 루프                     |
| [03-factories.md](./design/03-factories.md)           | 공장 종류 및 생산 체인             |
| [04-economy.md](./design/04-economy.md)               | 경제 시스템 (돈/자재/원자재)       |
| [05-warehouse.md](./design/05-warehouse.md)           | 창고 시스템                        |
| [06-market.md](./design/06-market.md)                 | 마켓 (글로벌/유저)                 |
| [07-global-system.md](./design/07-global-system.md)   | 글로벌 시스템 (신뢰도/세금)        |
| [08-stock.md](./design/08-stock.md)                   | 주식 시스템                        |
| [09-level-xp.md](./design/09-level-xp.md)             | 레벨 · 경험치                      |
| [10-open-questions.md](./design/10-open-questions.md) | 미결정 이슈                        |
| [11-land.md](./design/11-land.md)                     | 토지 시스템 (이모지 그리드)        |

## 현재 확정된 설계

- ✅ 온보딩: 초기 자금 1,000원 + 토지/창고 자동 지급 + 튜토리얼 퀘스트 5단계
- ✅ 자재 기준가 확정 (T1/T2/T3 전체, 00-onboarding.md)
- ✅ 자동 생산 + 창고 한도
- ✅ 자재 직구매: 할증가 + 일일 한도
- ✅ 공장: 등급 + 종류 둘 다
- ✅ 원자재: 글로벌 변동가 + 유저 상점 병행
- ✅ 3-Tier 생산 체인 구조
