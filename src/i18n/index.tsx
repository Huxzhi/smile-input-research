import { createContext, useContext, useState, type ReactNode } from 'react'
import type { Language } from '../types'
import zh from './zh.json'
import ja from './ja.json'
import en from './en.json'

const locales = { zh, ja, en }

interface I18nContextType {
  lang: Language
  setLang: (l: Language) => void
  t: (key: string, vars?: Record<string, string>) => string
  tArray: (key: string) => string[]
}

const Context = createContext<I18nContextType>({} as I18nContextType)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Language>('en')

  const t = (key: string, vars?: Record<string, string>): string => {
    const parts = key.split('.')
    let val: unknown = locales[lang]
    for (const p of parts) val = (val as Record<string, unknown>)?.[p]
    let str = typeof val === 'string' ? val : key
    if (vars) {
      for (const [k, v] of Object.entries(vars)) str = str.replace(`{${k}}`, v)
    }
    return str
  }

  const tArray = (key: string): string[] => {
    const parts = key.split('.')
    let val: unknown = locales[lang]
    for (const p of parts) val = (val as Record<string, unknown>)?.[p]
    return Array.isArray(val) ? (val as string[]) : []
  }

  return <Context.Provider value={{ lang, setLang, t, tArray }}>{children}</Context.Provider>
}

export const useI18n = () => useContext(Context)
