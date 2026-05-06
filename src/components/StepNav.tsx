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
  participantId?: string
  onParticipantIdChange?: (id: string) => void
  conditionIdx?: number
  onConditionIdxChange?: (idx: number) => void
}

export function StepNav({
  steps, currentStep, completedSteps, lockedSteps = new Set(), onStepClick, subSteps,
  participantId, onParticipantIdChange, conditionIdx, onConditionIdxChange,
}: Props) {
  const showConfig = participantId !== undefined || conditionIdx !== undefined

  return (
    <div style={{ background: '#0a0d14', borderBottom: '1px solid #1e2430', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '4px 12px', gap: 0 }}>
        {/* Scrollable step buttons */}
        <div style={stepRow}>
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

        {/* Right-aligned config */}
        {showConfig && (
          <div style={configRow}>
            {participantId !== undefined && (
              <div style={cfgItem}>
                <span style={cfgLabel}>参与者</span>
                {onParticipantIdChange ? (
                  <input
                    value={participantId}
                    onChange={e => onParticipantIdChange(e.target.value)}
                    placeholder="ID"
                    style={cfgInput}
                  />
                ) : (
                  <span style={cfgValue}>{participantId || '-'}</span>
                )}
              </div>
            )}
            {conditionIdx !== undefined && (
              <div style={cfgItem}>
                <span style={cfgLabel}>拉丁方</span>
                {onConditionIdxChange ? (
                  <select
                    value={conditionIdx}
                    onChange={e => onConditionIdxChange(Number(e.target.value))}
                    style={cfgSelect}
                  >
                    {[0, 1, 2, 3, 4, 5].map(i => (
                      <option key={i} value={i}>{i + 1}</option>
                    ))}
                  </select>
                ) : (
                  <span style={cfgValue}>{conditionIdx + 1}</span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {subSteps && subSteps.length > 0 && (
        <div style={{ ...stepRow, paddingTop: 4, paddingBottom: 8, paddingLeft: 12, paddingRight: 12, borderTop: '1px solid #141820' }}>
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

const stepRow: CSSProperties = {
  display: 'flex', gap: 4, overflowX: 'auto', flex: 1,
  padding: '4px 0',
}

const configRow: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
  paddingLeft: 12, borderLeft: '1px solid #1e2430', marginLeft: 8,
}

const cfgItem: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 4,
}

const cfgLabel: CSSProperties = {
  fontSize: 11, color: '#444', whiteSpace: 'nowrap',
}

const cfgValue: CSSProperties = {
  fontSize: 12, color: '#8be9fd', fontFamily: 'monospace',
}

const cfgInput: CSSProperties = {
  padding: '2px 6px', borderRadius: 4, border: '1px solid #21262d',
  background: '#111827', color: '#cdd6f4', fontSize: 12, width: 72, outline: 'none',
}

const cfgSelect: CSSProperties = {
  padding: '2px 4px', borderRadius: 4, border: '1px solid #21262d',
  background: '#111827', color: '#cdd6f4', fontSize: 12, outline: 'none',
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
