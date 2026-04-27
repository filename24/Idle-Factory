---
name: factory-slot-patterns
description: 팩토리 슬롯 배열 순회·보너스 계산·물질 잔액 추적 패턴
evolved_from:
  - locked-slot-skip
  - special-slot-bonus-calc
  - material-balance-tracking
---

# factory-slot-patterns Skill

팩토리 슬롯 관련 게임 로직을 작성할 때 반복되는 세 가지 핵심 패턴.

## 규칙 1: 잠금 슬롯 먼저 스킵

슬롯 배열을 반복할 때 **첫 번째 줄**에서 잠금 슬롯을 건너뛴다.

```typescript
for (const slot of slots) {
  if (slot.locked) continue
  // 실제 로직
}
```

`locked: true`인 슬롯에 생산·수확·렌더 로직이 닿으면 잘못된 결과가 나온다.

## 규칙 2: 특수 슬롯 보너스 계산 패턴

슬롯 배열에서 최고 보너스값을 구하고 `slotBonus` 변수로 생산 계산에 전달한다.

```typescript
// specialSlots.ts
export function getSpecialSlotBonus(slots: Slot[]): number {
  return slots
    .filter((s) => !s.locked && s.type === 'special')
    .reduce((max, s) => Math.max(max, s.bonus ?? 1), 1)
}

// harvest.ts
const slotBonus = getSpecialSlotBonus(user.slots)
const output = applyMultipliers(base, { slotBonus })
```

## 규칙 3: 물질 잔액 추적 패턴

수확 시 빈 `MaterialBag`으로 시작해 스택을 순회하며 소비/생산을 순차 적용한다.

```typescript
const balance: MaterialBag = {}

for (const stack of productionStacks) {
  for (const [mat, qty] of Object.entries(stack.consumes)) {
    balance[mat] = (balance[mat] ?? 0) - qty
  }
  for (const [mat, qty] of Object.entries(stack.produces)) {
    balance[mat] = (balance[mat] ?? 0) + qty
  }
}
```

잔액이 음수면 재료 부족 — 수확 전 검증에 활용한다.
