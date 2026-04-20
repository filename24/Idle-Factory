# 02. 코어 루프

## 게임플레이 루프

```mermaid
flowchart TD
    Start([게임 시작]) --> Build[공장 건설]
    Build --> Produce[자동 생산]
    Produce --> Warehouse{창고에 저장}
    Warehouse -->|여유 있음| Store[자재 저장]
    Warehouse -->|가득 참| Stop[생산 중단]
    Store --> Decide{자재 용도}
    Decide -->|업그레이드| Upgrade[공장 강화]
    Decide -->|신축| NewFactory[상위 Tier 공장]
    Decide -->|판매| Market[마켓 판매]
    Upgrade --> Produce
    NewFactory --> Produce
    Market --> Money[돈 획득]
    Money --> Raw[원자재 구매]
    Money --> Stock[주식 투자]
    Raw --> Boost[공장 부스터]
    Boost --> Produce
```

## 경험치 획득 행동

| 행동      | 경험치 |
| --------- | ------ |
| 공장 건설 | ⭕     |
| 유저 거래 | ⭕     |
| 주식 수익 | ⭕     |

> 구체적 수치는 `09-level-xp.md` 참조 (미정)

## 자원 흐름 요약

```mermaid
flowchart LR
    Raw[원자재] -->|부스터 투입| Factory[공장]
    Factory -->|생산| Mat[자재]
    Factory -->|생산| Money[돈]
    Mat -->|업그레이드| Factory
    Money -->|구매| Raw
    Money -->|구매 할증| Mat
    Mat -->|판매| Money
```

## 관련 스키마

참조: [`packages/database/prisma/schema.prisma`](https://github.com/filename24/Idle-Factory/blob/stable/packages/database/prisma/schema.prisma)

- `User.money`, `User.xp`, `User.level` — 유저 자산/성장
- `Factory`, `Factory.lastHarvestAt` — 자동 생산 tick 계산 기준
- `Warehouse`, `WarehouseStack` — 생산 결과 저장
- `MarketListing`, `GlobalMarketPrice` — 판매·구매 경로
