'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import {
  updateGuildLangAction,
  updateGuildTaxAction,
} from '@/app/dashboard/[guildId]/settings/actions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import type { GuildSettingResult } from '@/lib/mutations/guild-settings'

/**
 * 서버 설정 변경 폼.
 *
 * ## 네이티브 `<select>` 를 쓰는 이유
 *
 * `<form action={…}>` + 네이티브 select 는 JS 가 없어도 제출된다. 여기서
 * 바꾸는 값은 서버 전체에 영향을 주므로, 자바스크립트 로딩 실패가 곧 기능
 * 상실이 되지 않게 점진적 향상을 우선한다.
 *
 * `guildId` 는 hidden input 으로 보내지만 **신뢰되지 않는다** — 서버 액션이
 * 매번 `requireGuildAdmin` 으로 재인가한다. 이 폼을 감추는 것은 인가가 아니다.
 */

interface GuildSettingFormProps {
  readonly guildId: string
  readonly kind: 'lang' | 'tax'
  readonly currentValue: string
  readonly options: readonly { readonly value: string; readonly label: string }[]
  readonly label: string
  readonly description: string
}

type SettingState = GuildSettingResult | null

export function GuildSettingForm({
  guildId,
  kind,
  currentValue,
  options,
  label,
  description,
}: GuildSettingFormProps): React.ReactElement {
  const t = useTranslations('guildAdmin')

  const [state, formAction, pending] = useActionState<SettingState, FormData>(
    async (_prev, formData) =>
      kind === 'lang' ? updateGuildLangAction(formData) : updateGuildTaxAction(formData),
    null,
  )

  const fieldName = kind === 'lang' ? 'lang' : 'surcharge'
  const selectId = `guild-setting-${kind}`

  return (
    <div className="border-hairline space-y-3 rounded border p-4">
      <div className="space-y-1">
        <label htmlFor={selectId} className="text-ink block text-sm font-medium">
          {label}
        </label>
        <p className="text-ash text-xs">{description}</p>
      </div>

      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="guildId" value={guildId} />
        <select
          id={selectId}
          name={fieldName}
          defaultValue={currentValue}
          className="border-hairline bg-surface text-body focus-visible:ring-ring rounded border px-3 py-1.5 text-sm outline-none focus-visible:ring-2"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? t('saving') : t('save')}
        </Button>
      </form>

      {state && (
        <Alert variant={state.ok ? undefined : 'destructive'} aria-live="polite">
          <AlertDescription>{state.ok ? t('saved') : t(`errors.${state.code}`)}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
