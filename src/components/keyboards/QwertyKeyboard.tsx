import { useCallback } from 'react'
import type { InputController } from '../../core/InputController'
import type { GazePoint } from '../../types'
import { KeyboardKey } from './KeyboardKey'

const ROWS = [
  ['Q','W','E','R','T','Y','U','I','O','P'],
  ['A','S','D','F','G','H','J','K','L'],
  ['Z','X','C','V','B','N','M','SPACE','BACKSPACE'],
]

const GAP = 8

// Widest effective row: row2 stagger(1×W) + 7 keys + SPACE(2.5×W) + BACK(1.5×W) + 8 gaps = 12W + 8*GAP
export function computeQwertyKeySize(availW: number, availH: number): number {
  const fromWidth = Math.floor((availW - 8 * GAP) / 12)
  const fromHeight = Math.floor((availH - 2 * GAP) / 3)
  return Math.max(40, Math.min(fromWidth, fromHeight))
}

interface Props {
  controller: InputController
  gaze: GazePoint | null
  targetChar: string
  onKeyRect: (key: string, rect: DOMRect) => void
  keySize?: number
}

export function QwertyKeyboard({ controller, gaze: _gaze, targetChar, onKeyRect, keySize = 72 }: Props) {
  const handleRect = useCallback(onKeyRect, [onKeyRect])
  const stagger = [0, Math.round(keySize * 0.5), Math.round(keySize * 1.0)]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: GAP, alignItems: 'center', padding: 16 }}>
      {ROWS.map((row, ri) => (
        <div key={ri} style={{ display: 'flex', gap: GAP, marginLeft: stagger[ri] }}>
          {row.map(key => (
            <KeyboardKey
              key={key}
              label={key}
              controller={controller}
              onKeyRect={handleRect}
              size={keySize}
              isTarget={
                key.toLowerCase() === targetChar ||
                (key === 'SPACE' && targetChar === ' ')
              }
              style={
                key === 'BACKSPACE' ? { width: Math.round(keySize * 1.5) } :
                key === 'SPACE' ? { width: Math.round(keySize * 2.5) } :
                undefined
              }
            />
          ))}
        </div>
      ))}
    </div>
  )
}
