import type { CSSProperties } from 'react'

interface SubStep {
  label: string
  done: boolean
  active: boolean
}

interface Props {
  steps: { label: string }[]
  currentStep: number
  completedSteps: Set<number>
  lockedSteps?: Set<number>
  onStepClick: (index: number) => void
  subSteps?: SubStep[]
}

export function StepNav({
  steps, currentStep, completedSteps, lockedSteps = new Set(), onStepClick, subSteps,
}: Props) {
  return (
    <div style={{ background: '#0a0d14', borderBottom: '1px solid #1e2430', flexShrink: 0 }}>
      <div style={navBar}>
        {steps.map((s, i) => {
          const isCompleted = completedSteps.has(i)
          const isCurrent   = i === currentStep
          const isLocked    = lockedSteps.has(i)
          const canClick    = !isLocked
          return (
            <button
              key={i}
              onClick={() => canClick && onStepClick(i)}
              style={stepBtn(isCurrent, isCompleted, isLocked, canClick)}
            >
              <span style={{ fontSize: 11, marginRight: 4 }}>
                {isCompleted ? '✓' : i + 1}
              </span>
              {s.label}
            </button>
          )
        })}
      </div>

      {subSteps && subSteps.length > 0 && (
        <div style={{ ...navBar, paddingTop: 4, paddingBottom: 8, borderTop: '1px solid #141820' }}>
          {subSteps.map((sub, i) => (
            <div
              key={i}
              style={{
                padding: '3px 10px', borderRadius: 4, fontSize: 11, whiteSpace: 'nowrap',
                background: sub.active ? '#1a2840' : 'transparent',
                color: sub.done ? '#50fa7b' : sub.active ? '#8be9fd' : '#3a4060',
                border: `1px solid ${sub.active ? '#2a5080' : 'transparent'}`,
              }}
            >
              {sub.done ? '✓ ' : sub.active ? '◉ ' : '○ '}
              {sub.label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const navBar: CSSProperties = {
  display: 'flex', gap: 4, padding: '8px 12px',
  overflowX: 'auto',
}

const stepBtn = (
  current: boolean, completed: boolean, locked: boolean, canClick: boolean,
): CSSProperties => ({
  padding: '6px 14px', borderRadius: 6, border: 'none',
  fontSize: 13, cursor: canClick ? 'pointer' : 'default', whiteSpace: 'nowrap',
  background: current ? '#5a7aff' : completed ? '#1a3a1a' : '#161c28',
  color: current ? '#fff' : completed ? '#50fa7b' : locked ? '#2a2a3a' : '#6a7490',
  opacity: locked ? 0.5 : 1,
  transition: 'background 150ms',
})
