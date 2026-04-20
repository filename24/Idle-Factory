export type XpEvent =
  | { kind: 'TICK_PRODUCTION'; ticks: number }
  | { kind: 'MARKET_SELL'; count?: number }
  | { kind: 'USER_TRADE'; count?: number }
  | { kind: 'STOCK_REALIZE'; count?: number }
  | { kind: 'BUILD'; cost: bigint }
  | { kind: 'UPGRADE'; cost: bigint }

export interface XpProgress {
  readonly level: number
  readonly xpInLevel: bigint
}

export interface ApplyXpResult {
  readonly progress: XpProgress
  readonly levelsGained: number
  readonly leveledUp: boolean
}

const BUILD_XP_CAP = 1000n
const BUILD_XP_DIVISOR = 1000n

export function xpRequiredForLevel(level: number): bigint {
  if (!Number.isFinite(level) || !Number.isInteger(level) || level < 1) {
    throw new RangeError(`level must be an integer >= 1, got ${level}`)
  }
  const raw = Math.floor(100 * Math.pow(level, 2.2))
  return BigInt(raw)
}

export function xpForEvent(event: XpEvent): bigint {
  switch (event.kind) {
    case 'TICK_PRODUCTION':
      return 5n * BigInt(event.ticks)
    case 'MARKET_SELL':
      return 20n * BigInt(event.count ?? 1)
    case 'USER_TRADE':
      return 15n * BigInt(event.count ?? 1)
    case 'STOCK_REALIZE':
      return 10n * BigInt(event.count ?? 1)
    case 'BUILD':
    case 'UPGRADE': {
      const scaled = event.cost / BUILD_XP_DIVISOR
      return scaled < BUILD_XP_CAP ? scaled : BUILD_XP_CAP
    }
  }
}

export function applyXp(current: XpProgress, delta: bigint): ApplyXpResult {
  let level = current.level
  let xpInLevel = current.xpInLevel + delta
  let gained = 0
  while (true) {
    const req = xpRequiredForLevel(level)
    if (xpInLevel < req) break
    xpInLevel -= req
    level += 1
    gained += 1
  }
  return {
    progress: { level, xpInLevel },
    levelsGained: gained,
    leveledUp: gained > 0,
  }
}
