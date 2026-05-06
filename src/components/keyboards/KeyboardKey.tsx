import { useEffect, useRef } from 'react'
import type { InputController } from '../../core/InputController'

interface Props {
  label: string
  rectKey?: string  // unique hit-test id; defaults to label (use when label appears multiple times)
  controller: InputController
  onKeyRect: (key: string, rect: DOMRect) => void
  isTarget?: boolean  // highlight this key as the current target (tutorial only)
  size?: number
  style?: React.CSSProperties
}

export function KeyboardKey({ label, rectKey, controller, onKeyRect, isTarget, size = 72, style }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (ref.current) {
      onKeyRect(rectKey ?? label, ref.current.getBoundingClientRect())
    }
  }, [label, rectKey, onKeyRect, size])

  const progress     = controller.getDwellProgress(label)
  const candidateKey = controller.getCandidateKey()
  const isCandidate  = candidateKey === (rectKey ?? label)
  const isCandidateLocked = isCandidate && controller.isCandidateLocked()
  const isFocused    = controller.getFocusedKey() === (rectKey ?? label)

  const r = Math.round(size / 2 - 4)
  const svgSize = size + 8
  const svgCenter = svgSize / 2
  const circumference = 2 * Math.PI * r
  const fontSize = Math.round(size * 0.28)
  const borderRadius = Math.round(size * 0.11)

  return (
    <div
      ref={ref}
      style={{
        position: 'relative',
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: isTarget ? '#1a3a5c' : isCandidateLocked ? '#0a2414' : isCandidate ? '#1a2a18' : isFocused ? '#1e2a5a' : '#1e1e3e',
        border: `2px solid ${isCandidateLocked ? '#50fa7b' : isCandidate ? '#f1fa8c' : isTarget ? '#50fa7b' : isFocused ? '#5a7aff' : '#333'}`,
        boxShadow: isCandidateLocked ? '0 0 10px 3px rgba(80,250,123,0.4)' : isCandidate ? '0 0 8px 2px rgba(241,250,140,0.3)' : isFocused ? '0 0 8px 2px rgba(90,122,255,0.5)' : undefined,
        borderRadius,
        color: isTarget ? '#50fa7b' : isCandidate ? '#f1fa8c' : '#cdd6f4',
        fontSize,
        fontWeight: isTarget || isCandidate ? 'bold' : 'normal',
        userSelect: 'none',
        cursor: 'default',
        flexShrink: 0,
        ...style,
      }}
    >
      {progress > 0 && (
        <svg
          style={{ position: 'absolute', top: -4, left: -4, pointerEvents: 'none' }}
          width={svgSize}
          height={svgSize}
        >
          <circle cx={svgCenter} cy={svgCenter} r={r} fill="none" stroke="#333" strokeWidth={4} />
          <circle
            cx={svgCenter}
            cy={svgCenter}
            r={r}
            fill="none"
            stroke="#5a7aff"
            strokeWidth={4}
            strokeDasharray={`${progress * circumference} ${circumference}`}
            strokeDashoffset={0}
            transform={`rotate(-90 ${svgCenter} ${svgCenter})`}
          />
        </svg>
      )}
      {label === 'SPACE' ? '␣' : label === 'BACKSPACE' ? '⌫' : label}
    </div>
  )
}
