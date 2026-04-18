import { useCallback } from 'react'
import type { InputController } from '../../core/InputController'
import type { GazePoint } from '../../types'
import { KeyboardKey } from './KeyboardKey'

// Custom OPTI layout — uniform 6×5 grid, no stagger
const ROWS = [
  ['Q', 'F', 'U', 'M', 'C', 'K'],
  ['G', 'S', 'I', 'T', 'O', 'SPACE'],
  ['SPACE', 'A', 'E', 'H', 'N', 'B'],
  ['V', 'R', 'D', 'L', 'U', 'SPACE'],
  ['W', 'J', 'SPACE', 'P', 'Y', 'X'],
]

const GAP = 8

// 6 columns × 5 rows uniform grid
export function computeOptiKeySize(availW: number, availH: number): number {
  const fromWidth  = Math.floor((availW - 5 * GAP) / 6)
  const fromHeight = Math.floor((availH - 4 * GAP) / 5)
  return Math.max(40, Math.min(fromWidth, fromHeight))
}

interface Props {
  controller: InputController
  gaze: GazePoint | null
  targetChar: string
  onKeyRect: (key: string, rect: DOMRect) => void
  keySize?: number
}

export function OptiKeyboard({ controller, gaze: _gaze, targetChar, onKeyRect, keySize = 72 }: Props) {
  const handleRect = useCallback(onKeyRect, [onKeyRect])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: GAP, alignItems: 'center', padding: 16 }}>
      {ROWS.map((row, ri) => (
        <div key={ri} style={{ display: 'flex', gap: GAP }}>
          {row.map((key, ki) => (
            <KeyboardKey
              key={`${ri}-${ki}`}
              label={key}
              controller={controller}
              onKeyRect={handleRect}
              size={keySize}
              isTarget={
                key.toLowerCase() === targetChar ||
                (key === 'SPACE' && targetChar === ' ')
              }
            />
          ))}
        </div>
      ))}
    </div>
  )
}
