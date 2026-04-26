/**
 * 길드(서버) 단위 설정 서비스.
 *
 * - upsert/leftAt 토글로 봇 가입/퇴장 라이프사이클 관리.
 * - 어드민이 변경하는 설정(lang, taxSurcharge) 의 단일 진입점.
 *
 * 참조: docs/design/07-server.md §세금·정산
 */

import type { Guild as GuildRow, PrismaClient } from '@idle/database'
import { ServiceError } from './base'

/** taxSurcharge 허용 범위 (docs/07). */
const MIN_TAX_SURCHARGE = 0
const MAX_TAX_SURCHARGE = 0.2
/** 신규 가입 시 기본 가산 세율 — guildCreate 와 setup 양쪽이 일관되게 사용. */
export const DEFAULT_TAX_SURCHARGE = 0.1

export interface UpsertOnJoinInput {
  readonly guildId: string
  readonly name: string
  readonly lang?: string
}

export const GuildService = {
  /**
   * 봇이 길드에 들어왔을 때 호출. row 가 없으면 생성, 있으면 name 갱신 + leftAt 클리어.
   * 재초대 시나리오를 안전하게 처리.
   */
  async upsertOnJoin(
    prisma: PrismaClient,
    input: UpsertOnJoinInput
  ): Promise<GuildRow> {
    return prisma.guild.upsert({
      where: { id: input.guildId },
      create: {
        id: input.guildId,
        name: input.name,
        ...(input.lang !== undefined ? { lang: input.lang } : {}),
        taxSurcharge: DEFAULT_TAX_SURCHARGE
      },
      update: {
        name: input.name,
        leftAt: null
      }
    })
  },

  /**
   * 봇이 길드를 떠났을 때 호출. row 가 있으면 leftAt 만 set.
   * row 가 없으면 no-op (이미 등록 안 된 길드).
   */
  async markLeft(prisma: PrismaClient, guildId: string): Promise<void> {
    await prisma.guild.updateMany({
      where: { id: guildId, leftAt: null },
      data: { leftAt: new Date() }
    })
  },

  /** 어드민 액션 — 길드 언어 변경. */
  async updateLang(
    prisma: PrismaClient,
    guildId: string,
    lang: string
  ): Promise<GuildRow> {
    const exists = await prisma.guild.findUnique({
      where: { id: guildId },
      select: { id: true }
    })
    if (!exists) {
      throw new ServiceError(
        'USER_NOT_FOUND',
        `guild ${guildId} not registered`
      )
    }
    return prisma.guild.update({
      where: { id: guildId },
      data: { lang }
    })
  },

  /** 어드민 액션 — 가산 세율 변경. 0~0.2 범위 강제. */
  async updateTaxSurcharge(
    prisma: PrismaClient,
    guildId: string,
    surcharge: number
  ): Promise<GuildRow> {
    if (
      !Number.isFinite(surcharge) ||
      surcharge < MIN_TAX_SURCHARGE ||
      surcharge > MAX_TAX_SURCHARGE
    ) {
      throw new ServiceError(
        'INVALID_PRICE',
        `taxSurcharge must be in [${MIN_TAX_SURCHARGE}, ${MAX_TAX_SURCHARGE}], got ${surcharge}`
      )
    }
    const exists = await prisma.guild.findUnique({
      where: { id: guildId },
      select: { id: true }
    })
    if (!exists) {
      throw new ServiceError(
        'USER_NOT_FOUND',
        `guild ${guildId} not registered`
      )
    }
    return prisma.guild.update({
      where: { id: guildId },
      data: { taxSurcharge: surcharge }
    })
  }
} as const
