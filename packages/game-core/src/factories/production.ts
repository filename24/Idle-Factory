import type { FactoryState, MaterialBag, MaterialType } from '../types'
import { getFactoryEntry } from './catalog'

export const TICK_MS = 10 * 60 * 1000
export const MAX_TICKS_PER_HARVEST = 10_000

export interface ComputeFactoryYieldParams {
  factory: FactoryState
  availableMaterials: MaterialBag
  warehouseFree: bigint
  elapsedTicks: number
  slotBonus?: number
  synergyBonus?: number
}

export interface FactoryYield {
  ticksRealized: number
  produced: MaterialBag
  consumed: MaterialBag
}

export interface GradeMultiplier {
  numerator: bigint
  denominator: bigint
}

export function computeElapsedTicks(lastHarvestAt: Date, now: Date): number {
  const diff = now.getTime() - lastHarvestAt.getTime()
  if (diff < 0) return 0
  const ticks = Math.floor(diff / TICK_MS)
  return Math.min(ticks, MAX_TICKS_PER_HARVEST)
}

export function computeGradeMultiplier(grade: number, hasRawBooster: boolean): GradeMultiplier {
  const exponent = Math.max(0, grade - 1)
  let numerator = 1n
  let denominator = 1n
  for (let i = 0; i < exponent; i += 1) {
    numerator *= 3n
    denominator *= 2n
  }
  if (hasRawBooster) {
    numerator *= 12n
    denominator *= 10n
  }
  return { numerator, denominator }
}

function addToBag(bag: MaterialBag, material: MaterialType, amount: bigint): void {
  if (amount <= 0n) return
  const existing = bag[material] ?? 0n
  bag[material] = existing + amount
}

function scaleBigint(value: bigint, bonus: number): bigint {
  const scaled = BigInt(Math.round(bonus * 100))
  return (value * scaled) / 100n
}

function applyMultipliers(
  base: bigint,
  ticks: bigint,
  mult: GradeMultiplier,
  slotBonus: number,
  synergyBonus: number,
): bigint {
  const baseTotal = base * ticks
  const withGrade = (baseTotal * mult.numerator) / mult.denominator
  const withSlot = scaleBigint(withGrade, slotBonus)
  return scaleBigint(withSlot, synergyBonus)
}

function computeOutputsForTicks(
  catalog: ReturnType<typeof getFactoryEntry>,
  ticks: number,
  mult: GradeMultiplier,
  slotBonus: number,
  synergyBonus: number,
): { produced: MaterialBag; totalUnits: bigint } {
  const produced: MaterialBag = {}
  let totalUnits = 0n
  if (ticks <= 0) return { produced, totalUnits }
  const ticksBig = BigInt(ticks)

  const primary = applyMultipliers(catalog.baseProduction, ticksBig, mult, slotBonus, synergyBonus)
  addToBag(produced, catalog.output, primary)
  totalUnits += primary

  for (const sec of catalog.secondaryOutputs) {
    const amount = applyMultipliers(sec.amount, ticksBig, mult, slotBonus, synergyBonus)
    addToBag(produced, sec.material, amount)
    totalUnits += amount
  }

  return { produced, totalUnits }
}

export function computeFactoryYield(params: ComputeFactoryYieldParams): FactoryYield {
  const { factory, availableMaterials, warehouseFree, slotBonus = 1.0, synergyBonus = 1.0 } = params
  let { elapsedTicks } = params

  const catalog = getFactoryEntry(factory.type)

  if (elapsedTicks <= 0) {
    return { ticksRealized: 0, produced: {}, consumed: {} }
  }

  // Material clamp (T2/T3 recipes).
  if (catalog.recipe.length > 0) {
    let maxByMaterial = Number.POSITIVE_INFINITY
    for (const req of catalog.recipe) {
      const available = availableMaterials[req.material] ?? 0n
      const possible = Math.floor(Number(available) / Number(req.amount))
      if (possible < maxByMaterial) maxByMaterial = possible
    }
    // Phase 1: PAUSE | AUTO_BUY | PARTIAL all treated as PAUSE.
    // TODO(phase-2): implement AUTO_BUY (market purchase) and PARTIAL.
    elapsedTicks = Math.min(elapsedTicks, maxByMaterial)
  }

  if (elapsedTicks <= 0) {
    return { ticksRealized: 0, produced: {}, consumed: {} }
  }

  const mult = computeGradeMultiplier(factory.grade, factory.hasRawBooster)

  // First pass to inspect whether warehouse can hold the output.
  const firstPass = computeOutputsForTicks(catalog, elapsedTicks, mult, slotBonus, synergyBonus)

  if (firstPass.totalUnits > warehouseFree) {
    const perTick = computeOutputsForTicks(catalog, 1, mult, slotBonus, synergyBonus).totalUnits
    if (perTick <= 0n) {
      return { ticksRealized: 0, produced: {}, consumed: {} }
    }
    const ticksToFit = Number(warehouseFree / perTick)
    elapsedTicks = Math.min(elapsedTicks, ticksToFit)
  }

  if (elapsedTicks <= 0) {
    return { ticksRealized: 0, produced: {}, consumed: {} }
  }

  const finalOutputs = computeOutputsForTicks(catalog, elapsedTicks, mult, slotBonus, synergyBonus)

  const consumed: MaterialBag = {}
  for (const req of catalog.recipe) {
    addToBag(consumed, req.material, req.amount * BigInt(elapsedTicks))
  }

  return {
    ticksRealized: elapsedTicks,
    produced: finalOutputs.produced,
    consumed,
  }
}
