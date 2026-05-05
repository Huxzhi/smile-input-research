import { useState } from 'react'
import type { CSSProperties } from 'react'
import { isComplete } from '../surveys/types'
import type { QuestionDef, SurveyAnswers } from '../surveys/types'

interface Props {
  title?: string
  subtitle?: string
  questions: QuestionDef[]
  initialAnswers?: Partial<SurveyAnswers>
  submitLabel?: string
  showSubmit?: boolean
  onChange?: (answers: SurveyAnswers) => void
  onSubmit: (answers: SurveyAnswers) => void
}

function initAnswers(questions: QuestionDef[], initial: Partial<SurveyAnswers> = {}): SurveyAnswers {
  const init: SurveyAnswers = {}
  for (const q of questions) {
    if (initial[q.id] !== undefined) {
      init[q.id] = initial[q.id]!
    } else if (q.type === 'panas_batch') {
      init[q.id] = new Array(q.items.length).fill(0)
    } else if (q.type === 'rank') {
      init[q.id] = q.items.map(i => i.value)
    } else if (q.type === 'score100') {
      init[q.id] = 50
    }
  }
  return init
}


export function SurveyForm({ title, subtitle, questions, initialAnswers, submitLabel = '提交', showSubmit = true, onChange, onSubmit }: Props) {
  const [answers, setAnswers] = useState<SurveyAnswers>(() => initAnswers(questions, initialAnswers))

  const set = (id: string, val: SurveyAnswers[string]) =>
    setAnswers(prev => {
      const next = { ...prev, [id]: val }
      onChange?.(next)
      return next
    })

  const canSubmit = questions.every(q => isComplete(q, answers[q.id]))

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '32px 16px' }}>
      {title && <h2 style={{ marginBottom: subtitle ? 4 : 24 }}>{title}</h2>}
      {subtitle && <p style={{ color: '#888', marginBottom: 24, fontSize: 13 }}>{subtitle}</p>}

      {questions.map(q => (
        <QuestionRow
          key={q.id}
          q={q}
          value={answers[q.id]}
          onChange={val => set(q.id, val)}
        />
      ))}

      {showSubmit && (
        <button
          onClick={() => canSubmit && onSubmit(answers)}
          disabled={!canSubmit}
          style={{
            marginTop: 28, padding: '12px 32px', borderRadius: 8, border: 'none',
            background: canSubmit ? '#50fa7b' : '#333',
            color: canSubmit ? '#000' : '#666',
            fontSize: 16, cursor: canSubmit ? 'pointer' : 'not-allowed', width: '100%',
          }}
        >
          {submitLabel}
        </button>
      )}
    </div>
  )
}

// ── Question renderers ───────────────────────────────────────────────────────

function QuestionRow({ q, value, onChange }: {
  q: QuestionDef
  value: SurveyAnswers[string] | undefined
  onChange: (val: SurveyAnswers[string]) => void
}) {
  switch (q.type) {
    case 'text':
      return <TextQ q={q} value={(value as string) ?? ''} onChange={onChange} />
    case 'likert':
      return <LikertQ q={q} value={(value as number) ?? 0} onChange={onChange} />
    case 'score100':
      return <Score100Q q={q} value={(value as number) ?? 50} onChange={onChange} />
    case 'radio':
      return <RadioQ q={q} value={(value as string) ?? ''} onChange={onChange} />
    case 'panas_batch':
      return (
        <PanasBatchQ
          q={q}
          value={(value as number[]) ?? new Array(q.items.length).fill(0)}
          onChange={onChange}
        />
      )
    case 'rank':
      return (
        <RankQ
          q={q}
          value={(value as string[]) ?? q.items.map(i => i.value)}
          onChange={onChange}
        />
      )
  }
}

function TextQ({ q, value, onChange }: { q: Extract<QuestionDef, { type: 'text' }>; value: string; onChange: (v: string) => void }) {
  return (
    <div style={rowWrap}>
      <div style={rowLabel}>{q.label}</div>
      <input
        type="text"
        value={value}
        placeholder={q.placeholder}
        onChange={e => onChange(e.target.value)}
        style={textInput}
      />
    </div>
  )
}

function LikertQ({ q, value, onChange }: { q: Extract<QuestionDef, { type: 'likert' }>; value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ ...rowWrap, paddingBottom: 14 }}>
      <div style={rowLabel}>{q.label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={scaleEnd}>{q.lo}</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {Array.from({ length: q.points }, (_, i) => i + 1).map(v => (
            <button key={v} onClick={() => onChange(v)} style={scaleBtn(value === v)}>{v}</button>
          ))}
        </div>
        <span style={{ ...scaleEnd, textAlign: 'left' }}>{q.hi}</span>
      </div>
    </div>
  )
}

function Score100Q({ q, value, onChange }: { q: Extract<QuestionDef, { type: 'score100' }>; value: number; onChange: (v: number) => void }) {
  return (
    <div style={rowWrap}>
      <div style={rowLabel}>{q.label}</div>
      {q.subLabel && <div style={{ fontSize: 11, color: '#555', marginBottom: 8 }}>{q.subLabel}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <input
          type="range" min={0} max={100} value={value}
          onChange={e => onChange(Number(e.target.value))}
          style={{ flex: 1, accentColor: '#5a7aff' }}
        />
        <span style={{ width: 38, textAlign: 'right', fontSize: 16, fontWeight: 600, color: '#f1fa8c' }}>
          {value}
        </span>
      </div>
    </div>
  )
}

function RadioQ({ q, value, onChange }: { q: Extract<QuestionDef, { type: 'radio' }>; value: string; onChange: (v: string) => void }) {
  return (
    <div style={rowWrap}>
      <div style={rowLabel}>{q.label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {q.options.map(opt => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            style={radioBtn(value === opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function PanasBatchQ({ q, value, onChange }: {
  q: Extract<QuestionDef, { type: 'panas_batch' }>
  value: number[]
  onChange: (v: number[]) => void
}) {
  const set = (idx: number, v: number) => {
    const next = [...value]; next[idx] = v; onChange(next)
  }
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, marginBottom: 6 }}>
        {[1, 2, 3, 4, 5].map(v => (
          <div key={v} style={{ width: 40, textAlign: 'center', fontSize: 10, color: '#555' }}>{v}</div>
        ))}
      </div>
      {q.items.map((item, idx) => (
        <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #161c28' }}>
          <span style={{ flex: 1, fontSize: 14 }}>{item}</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {[1, 2, 3, 4, 5].map(v => (
              <button key={v} onClick={() => set(idx, v)} style={scaleBtn(value[idx] === v, 40)}>{v}</button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function RankQ({ q, value, onChange }: {
  q: Extract<QuestionDef, { type: 'rank' }>
  value: string[]
  onChange: (v: string[]) => void
}) {
  const labelOf = (val: string) => q.items.find(i => i.value === val)?.label ?? val

  const swap = (i: number, j: number) => {
    const next = [...value]; [next[i], next[j]] = [next[j], next[i]]; onChange(next)
  }

  return (
    <div style={rowWrap}>
      <div style={rowLabel}>{q.label}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {value.map((val, i) => (
          <div key={val} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 7, background: '#141c2e', border: '1px solid #1e2840' }}>
            <span style={{ fontSize: 13, color: '#555', marginRight: 10 }}>{i + 1}.</span>
            <span style={{ flex: 1, fontSize: 14 }}>{labelOf(val)}</span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={() => i > 0 && swap(i, i - 1)} disabled={i === 0} style={rankArrow(i === 0)}>↑</button>
              <button onClick={() => i < value.length - 1 && swap(i, i + 1)} disabled={i === value.length - 1} style={rankArrow(i === value.length - 1)}>↓</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Shared styles ────────────────────────────────────────────────────────────

const rowWrap: CSSProperties = {
  padding: '10px 0', borderBottom: '1px solid #1e1e3e', marginBottom: 4,
}

const rowLabel: CSSProperties = {
  fontSize: 14, color: '#cdd6f4', marginBottom: 10,
}

const textInput: CSSProperties = {
  padding: '8px 12px', borderRadius: 6, border: '1px solid #2a3050',
  background: '#141820', color: '#cdd6f4', fontSize: 15, width: 180,
}

const scaleEnd: CSSProperties = {
  fontSize: 11, color: '#555', width: 72, textAlign: 'right', flexShrink: 0,
}

const scaleBtn = (active: boolean, w = 40): CSSProperties => ({
  width: w, height: 34, borderRadius: 4, border: 'none', cursor: 'pointer',
  background: active ? '#5a7aff' : '#1a2030',
  color: active ? '#fff' : '#666', fontSize: 13,
})

const radioBtn = (active: boolean): CSSProperties => ({
  padding: '8px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
  background: active ? '#5a7aff' : '#1e1e3e',
  color: active ? '#fff' : '#888', fontSize: 14,
})

const rankArrow = (disabled: boolean): CSSProperties => ({
  width: 28, height: 28, borderRadius: 4, border: '1px solid #2a3050',
  background: 'transparent', color: disabled ? '#2a3050' : '#888',
  cursor: disabled ? 'default' : 'pointer', fontSize: 14,
})
