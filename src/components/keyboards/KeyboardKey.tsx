import { useEffect, useRef } from 'react'
import type { InputController } from '../../core/InputController'

interface Props {
  label: string
  controller: InputController
  onKeyRect: (key: string, rect: DOMRect) => void
  isTarget?: boolean
  size?: number
  style?: React.CSSProperties
}

export function KeyboardKey({ label, controller, onKeyRect, isTarget, size = 72, style }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (ref.current) {
      onKeyRect(label, ref.current.getBoundingClientRect())
    }
  }, [label, onKeyRect, size])

  const progress = controller.getDwellProgress(label)
  const isLocked = controller.getLockedKey() === label

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
        background: isTarget ? '#1a3a5c' : '#1e1e3e',
        border: `2px solid ${isLocked ? '#f1fa8c' : isTarget ? '#50fa7b' : '#333'}`,
        borderRadius,
        color: isTarget ? '#50fa7b' : '#aaa',
        fontSize,
        fontWeight: isTarget ? 'bold' : 'normal',
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
