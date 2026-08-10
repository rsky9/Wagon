import { createContext, useContext, useState, useCallback } from 'react'
import { resources, SUPPORTED_LANGUAGES } from './index'
import type { LanguageCode } from '@wagon/contracts'

/**
 * Lightweight, framework-agnostic language provider. Reads from the
 * `@wagon/i18n` resource catalog. Screens call `useI18n().t('key.path')`.
 * Persist the language via the `onChange` callback (apps wire AsyncStorage).
 */

export interface I18nValue {
  lang: LanguageCode
  setLang: (lang: LanguageCode) => void
  t: (key: string) => string
}

export const I18nContext = createContext<I18nValue>({
  lang: 'en',
  setLang: () => {},
  t: (key: string) => key,
})

export function I18nProvider({
  initialLang = 'en',
  onChange,
  children,
}: {
  initialLang?: LanguageCode
  onChange?: (lang: LanguageCode) => void
  children: React.ReactNode
}) {
  const [lang, setLangState] = useState<LanguageCode>(initialLang)

  const setLang = useCallback(
    (next: LanguageCode) => {
      setLangState(next)
      onChange?.(next)
    },
    [onChange],
  )

  const t = useCallback(
    (key: string) => {
      const res = resources[lang] ?? resources.en
      if (!res) return key
      // Resolve dot path like "common.continue"
      const parts = key.split('.')
      let node: unknown = res.translation
      for (const part of parts) {
        if (node && typeof node === 'object' && part in (node as object)) {
          node = (node as Record<string, unknown>)[part]
        } else {
          return key
        }
      }
      return typeof node === 'string' ? node : key
    },
    [lang],
  )

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>
  )
}

export function useI18n(): I18nValue {
  return useContext(I18nContext)
}

export { SUPPORTED_LANGUAGES }
export type { LanguageCode }
