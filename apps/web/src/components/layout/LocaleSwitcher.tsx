'use client'

import { Languages, Check } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useTransition } from 'react'
import { setLocale } from '@/i18n/actions'
import { LOCALES, LOCALE_LABELS, type Locale } from '@/i18n/config'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'

/**
 * 헤더 언어 전환 드롭다운.
 *
 * 선택은 Server Action 이 쿠키에 기록하고, 액션이 끝나면 서버 컴포넌트가 새 로케일로
 * 다시 렌더된다. `useTransition` 은 그 사이 트리거를 비활성화해 연타로 여러 액션이
 * 겹치는 것을 막는 용도다.
 *
 * 각 언어는 endonym(자기 언어 이름)으로 표시한다 — 지금 화면이 어떤 언어든
 * 자기 언어를 찾을 수 있어야 한다.
 */
export function LocaleSwitcher() {
  const current = useLocale()
  const t = useTranslations('locale')
  const [isPending, startTransition] = useTransition()

  function onSelect(locale: Locale) {
    if (locale === current) return
    startTransition(() => {
      void setLocale(locale)
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t('label')}
        disabled={isPending}
        className="text-mute hover:text-ink focus-visible:text-ink focus-visible:ring-ring focus-visible:ring-offset-canvas flex size-8 items-center justify-center rounded transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50"
      >
        <Languages aria-hidden="true" className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="border-hairline-strong bg-surface w-40">
        {LOCALES.map((locale) => (
          <DropdownMenuItem
            key={locale}
            onClick={() => onSelect(locale)}
            aria-label={t('switchTo', { locale: LOCALE_LABELS[locale] })}
            className="text-body hover:bg-elevated focus:bg-elevated justify-between gap-2"
          >
            {LOCALE_LABELS[locale]}
            {locale === current && <Check aria-hidden="true" className="size-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
