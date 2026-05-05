import { useState, useEffect, useRef } from 'react'

export function useStepCache<T>(key: string, initial: T): [T, (val: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw ? (JSON.parse(raw) as T) : initial
    } catch {
      return initial
    }
  })

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const set = (val: T) => {
    setValue(val)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      try { localStorage.setItem(key, JSON.stringify(val)) } catch { /* quota */ }
    }, 300)
  }

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  return [value, set]
}
