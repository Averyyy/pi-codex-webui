"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"

import { createTranslator, type Locale, type MessageKey } from "@/lib/i18n"

interface I18nContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: MessageKey, values?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale
  children: React.ReactNode
}) {
  const [locale, setLocaleState] = useState(initialLocale)
  const setLocale = useCallback((nextLocale: Locale) => {
    setLocaleState(nextLocale)
  }, [])
  const t = useMemo(() => createTranslator(locale), [locale])

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const value = useMemo(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t]
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const context = useContext(I18nContext)
  if (!context) {
    throw new Error("useI18n must be used within I18nProvider.")
  }
  return context
}
