import { Attributes } from '@prisma/client'

export function getRandomAttributes(): Partial<Attributes> {
  return {
    athletics: getRandomAttributesNumber(),
    construction: getRandomAttributesNumber(),
    machinery: getRandomAttributesNumber(),
    strength: getRandomAttributesNumber()
  }
}

export function getRandomAttributesNumber() {
  const count = Math.random()

  if (count <= 0.005) {
    return 0
  }
  if (count <= 0.005 + 0.62) {
    return ((Math.random() * 5) | 0) + 1
  }
  if (count <= 0.005 + 0.62 + 0.36) {
    return ((Math.random() * 7) | 0) + 6
  }
  return ((Math.random() * 2) | 0) + 13
}
