import { useState, useEffect, useRef } from 'react'
import { loadJSON, saveJSON } from '../utils/storage'

export function useStepCache<T>(key: string, initial: T): [T, (val: T) => void] {
  const [value, setValue] = useState<T>(() => loadJSON(key, initial))
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const set = (val: T) => {
    setValue(val)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => saveJSON(key, val), 300)
  }

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  return [value, set]
}
