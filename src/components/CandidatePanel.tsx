import type { InputController } from '../core/InputController'
import type { InputMethod } from '../types'
import { DWELL_MS } from '../types'

interface Props {
  ctrl: InputController | null
  inputMethod: InputMethod
}

export function CandidatePanel({ ctrl, inputMethod }: Props) {
  const candidate  = ctrl?.getCandidateKey()  ?? null
  const locked     = ctrl?.isCandidateLocked() ?? false
  const smileScore = inputMethod === 'smile' ? (ctrl?.getSmileScore() ?? 0) : 0
  const dwellProg  = inputMethod === 'dwell' && candidate
    ? (ctrl?.getDwellProgress(candidate) ?? 0) : 0

  const displayChar = candidate === 'SPACE' ? '␣' : (candidate?.toUpperCase() ?? '')

  const borderColor = locked ? '#50fa7b' : candidate ? '#5a7aff' : '#1e2430'
  const bgColor     = locked ? '#0a2414' : candidate ? '#0a1428' : '#080b12'
  const textColor   = locked ? '#50fa7b' : candidate ? '#cdd6f4' : '#2a3040'

  return (
    <div style={{
      width: 72, flexShrink: 0,
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
    }}>
      <span style={{ fontSize: 10, color: '#444', letterSpacing: 1 }}>候选</span>

      <div style={{
        width: 64, height: 64, borderRadius: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: bgColor,
        border: `2px solid ${borderColor}`,
        fontSize: 30, fontFamily: 'monospace', fontWeight: 'bold',
        color: textColor,
        transition: 'border-color 120ms, background 120ms, color 120ms',
        userSelect: 'none',
      }}>
        {displayChar}
      </div>

      {inputMethod === 'dwell' && (
        <div style={{ width: 64, height: 4, background: '#111827', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            width: `${dwellProg * 100}%`, height: '100%',
            background: '#5a7aff', borderRadius: 2,
            transition: `width ${DWELL_MS}ms linear`,
          }} />
        </div>
      )}

      {inputMethod === 'smile' && (
        <div style={{ width: 64, height: 4, background: '#111827', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            width: `${smileScore * 100}%`, height: '100%',
            background: smileScore > 0.6 ? '#50fa7b' : '#f1fa8c',
            borderRadius: 2,
          }} />
        </div>
      )}

      {locked && (
        <span style={{ fontSize: 9, color: borderColor, letterSpacing: 0.5 }}>
          {inputMethod === 'blink' ? '● 眨眼中' : '● 锁定'}
        </span>
      )}
    </div>
  )
}
