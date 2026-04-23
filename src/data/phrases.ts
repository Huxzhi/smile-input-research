import raw from './phrases2.txt?raw'

export const PHRASES: string[] = raw
  .split('\n')
  .map(l => l.trim())
  .filter(l => l.length > 0)
