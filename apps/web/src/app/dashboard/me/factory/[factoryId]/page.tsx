import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { FACTORY_CATALOG, type FactoryType } from '@idle/game-core'
import { auth } from '@/lib/auth'
import { resolveGameUserId } from '@/lib/game-user'
import { getMyFactory, type MaterialAmountDto } from '@/lib/queries/my-factory'
import { formatInt } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { StatTile } from '@/components/dashboard/StatTile'

/**
 * 공장 상세.
 *
 * 소유권은 쿼리(`getMyFactory`)의 `where` 절이 강제한다. 남의 공장 id 를 넣으면
 * `null` 이 나오고 `notFound()` 로 떨어지므로, 존재하지 않는 id 와 남의 id 를
 * 구분할 수 없다 — 의도한 동작이다.
 */

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('factory.meta')
  return { title: t('title'), description: t('description') }
}

interface FactoryPageProps {
  readonly params: Promise<{ factoryId: string }>
}

export default async function MyFactoryPage({
  params,
}: FactoryPageProps): Promise<React.ReactElement> {
  const { factoryId } = await params

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect(`/login?callbackUrl=/dashboard/me/factory/${factoryId}`)

  const gameUserId = await resolveGameUserId(session.user.id)
  if (!gameUserId) notFound()

  const factory = await getMyFactory(gameUserId, factoryId)
  if (!factory) notFound()

  const t = await getTranslations('factory')
  const tType = await getTranslations('factory.type')
  const tCommon = await getTranslations('common')
  const tMaterial = await getTranslations('material')

  const entry = FACTORY_CATALOG[factory.type as FactoryType]
  const atMaxGrade = factory.nextUpgrade === null

  /** 자재 수량을 "이름 ×수량" 문자열로 만든다. */
  const materialLabel = (item: MaterialAmountDto): string =>
    `${tMaterial(item.material)} ×${formatInt(item.amount)}`

  return (
    <section
      aria-labelledby="factory-heading"
      className="mx-auto max-w-3xl space-y-6 px-4 py-10 sm:px-6"
    >
      <header className="space-y-1">
        <Link
          href={`/dashboard/me/land/${factory.landIndex}`}
          className="text-ash hover:text-ink text-xs transition-colors"
        >
          ← {t('backToLand', { index: factory.landIndex })}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <span aria-hidden="true" className="text-2xl">
            {entry?.emoji ?? '🏭'}
          </span>
          <h1 id="factory-heading" className="font-display text-ink text-2xl">
            {tType(factory.type)}
          </h1>
          <Badge variant="secondary">{factory.tier}</Badge>
          {factory.isListed && <Badge>{t('listed')}</Badge>}
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label={t('tiles.grade')}
          value={`${factory.grade} / ${factory.effectiveMaxGrade}`}
          hint={atMaxGrade ? t('tiles.gradeMax') : undefined}
        />
        <StatTile
          label={t('tiles.position')}
          value={t('tiles.positionValue', { x: factory.anchorX + 1, y: factory.anchorY + 1 })}
          hint={t('tiles.landHint', { index: factory.landIndex })}
        />
        <StatTile
          label={t('tiles.bonus')}
          value={`×${factory.bonus.total}`}
          hint={t('tiles.bonusHint', {
            slot: factory.bonus.slotBonus,
            synergy: factory.bonus.synergyBonus,
          })}
          valueClassName={factory.bonus.total > 1 ? 'text-accent-orange' : undefined}
        />
        <StatTile label={t('tiles.slotType')} value={t(`slotType.${factory.slotType}`)} />
      </div>

      <DetailBlock title={t('production.title')}>
        <DetailRow
          label={t('production.output')}
          value={materialLabel(factory.baseProduction)}
          hint={t('production.perTick')}
        />
        {factory.secondaryOutputs.length > 0 && (
          <DetailRow
            label={t('production.secondary')}
            value={factory.secondaryOutputs.map(materialLabel).join(', ')}
          />
        )}
        <DetailRow
          label={t('production.recipe')}
          value={
            factory.recipe.length === 0
              ? t('production.noRecipe')
              : factory.recipe.map(materialLabel).join(', ')
          }
        />
        <DetailRow
          label={t('production.shortageMode')}
          value={t(`shortageMode.${factory.shortageMode}`)}
        />
      </DetailBlock>

      <DetailBlock title={t('upgrade.title')}>
        {factory.nextUpgrade ? (
          <>
            <DetailRow
              label={t('upgrade.toGrade', { grade: factory.nextUpgrade.toGrade })}
              value={tCommon('money', { amount: formatInt(factory.nextUpgrade.money) })}
            />
            <DetailRow
              label={t('upgrade.material')}
              value={materialLabel(factory.nextUpgrade.material)}
            />
          </>
        ) : (
          <p className="text-ash text-sm">{t('upgrade.maxReached')}</p>
        )}
        <DetailRow
          label={t('upgrade.booster')}
          value={
            factory.upgradeBooster ? t(`booster.${factory.upgradeBooster}`) : t('upgrade.noBooster')
          }
        />
        <DetailRow
          label={t('upgrade.rawBooster')}
          value={factory.hasRawBooster ? t('upgrade.applied') : t('upgrade.notApplied')}
        />
      </DetailBlock>

      <DetailBlock title={t('costs.title')}>
        <DetailRow
          label={t('costs.build')}
          value={tCommon('money', { amount: formatInt(factory.buildCost) })}
        />
        <DetailRow
          label={t('costs.move')}
          value={tCommon('money', { amount: formatInt(factory.moveCost) })}
        />
        <DetailRow
          label={t('costs.refund')}
          value={tCommon('money', { amount: formatInt(factory.destroyRefund) })}
          hint={factory.isListed ? t('costs.listedBlocked') : undefined}
        />
      </DetailBlock>
    </section>
  )
}

/** 상세 항목 묶음. */
function DetailBlock({
  title,
  children,
}: {
  readonly title: string
  readonly children: React.ReactNode
}): React.ReactElement {
  return (
    <div className="border-hairline space-y-2 rounded border p-4">
      <h2 className="font-display text-ink text-base">{title}</h2>
      <dl className="divide-divider-soft divide-y">{children}</dl>
    </div>
  )
}

/** 라벨 / 값 한 줄. */
function DetailRow({
  label,
  value,
  hint,
}: {
  readonly label: string
  readonly value: string
  readonly hint?: string
}): React.ReactElement {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 py-2">
      <dt className="text-ash text-sm">{label}</dt>
      <dd className="text-body text-right text-sm tabular-nums">
        {value}
        {hint && <span className="text-mute ml-2 text-xs">{hint}</span>}
      </dd>
    </div>
  )
}
