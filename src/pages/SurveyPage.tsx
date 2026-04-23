import { useState } from 'react'
import type { CSSProperties } from 'react'
import { useI18n } from '../i18n'
import type { EventLog, InputMethod } from '../types'

interface Props {
  sessionId: string
  participantId: string
  addLog: (log: EventLog) => void
  onNext: () => void
}

type Step = 'panas' | 'preference' | 'demographics'

export function SurveyPage({ sessionId, participantId, addLog, onNext }: Props) {
  const { t } = useI18n()
  const [step, setStep] = useState<Step>('panas')

  // PANAS state
  const panasItems: string[] = t('panas.items') as unknown as string[]
  const scale: string[] = t('survey.scale') as unknown as string[]
  const [panasAnswers, setPanasAnswers] = useState<number[]>(new Array(20).fill(0))
  const panasAllAnswered = panasAnswers.every(a => a > 0)

  // Preference state
  const [preferenceOrder, setPreferenceOrder] = useState<InputMethod[]>(['dwell', 'blink', 'smile'])
  const moveUp = (i: number) => {
    if (i === 0) return
    setPreferenceOrder(prev => {
      const arr = [...prev];
      [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]
      return arr
    })
  }
  const moveDown = (i: number) => {
    if (i === preferenceOrder.length - 1) return
    setPreferenceOrder(prev => {
      const arr = [...prev];
      [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]]
      return arr
    })
  }

  // Demographics state
  const [age, setAge] = useState('')
  const [gender, setGender] = useState('')
  const [hasEyeCondition, setHasEyeCondition] = useState<boolean | null>(null)
  const demoComplete = age !== '' && gender !== '' && hasEyeCondition !== null

  const handleFinalSubmit = () => {
    addLog({
      sessionId,
      participantId,
      ts: Date.now(),
      type: 'final_survey',
      description: 'Final survey completed',
      panasAnswers: JSON.stringify(panasAnswers),
      preferenceRank: JSON.stringify(preferenceOrder),
      age: parseInt(age) || undefined,
      gender,
      hasEyeCondition: hasEyeCondition ?? undefined,
    })
    onNext()
  }

  if (step === 'panas') {
    return (
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 16px' }}>
        <h2 style={{ marginBottom: 8 }}>{t('survey.title')}</h2>
        <p style={{ color: '#888', marginBottom: 24, fontSize: 13 }}>{t('survey.instruction')}</p>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, marginBottom: 8 }}>
          {scale.map((s, i) => (
            <div key={i} style={{ width: 60, textAlign: 'center', fontSize: 11, color: '#666' }}>{i + 1}<br />{s}</div>
          ))}
        </div>

        {panasItems.map((item, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #222' }}>
            <span style={{ flex: 1 }}>{item}</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {[1, 2, 3, 4, 5].map(v => (
                <button
                  key={v}
                  onClick={() => setPanasAnswers(a => { const n = [...a]; n[idx] = v; return n })}
                  style={{
                    width: 60, height: 32, borderRadius: 4, border: 'none', cursor: 'pointer',
                    background: panasAnswers[idx] === v ? '#5a7aff' : '#1e1e3e',
                    color: panasAnswers[idx] === v ? '#fff' : '#888', fontSize: 13,
                  }}
                >{v}</button>
              ))}
            </div>
          </div>
        ))}

        <button
          onClick={() => setStep('preference')}
          disabled={!panasAllAnswered}
          style={{
            marginTop: 24, padding: '12px 32px', borderRadius: 8, border: 'none',
            background: panasAllAnswered ? '#5a7aff' : '#333',
            color: panasAllAnswered ? '#fff' : '#666',
            fontSize: 16, cursor: panasAllAnswered ? 'pointer' : 'not-allowed', width: '100%',
          }}
        >
          {t('finalSurvey.next')}
        </button>
      </div>
    )
  }

  if (step === 'preference') {
    return (
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '32px 16px' }}>
        <h2 style={{ marginBottom: 8 }}>{t('finalSurvey.preferenceTitle')}</h2>
        <p style={{ color: '#888', marginBottom: 24, fontSize: 13 }}>{t('finalSurvey.preferenceInstruction')}</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {preferenceOrder.map((method, i) => (
            <div key={method} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 16px', borderRadius: 8, background: '#1a1a2e',
              border: '1px solid #2a2a4e',
            }}>
              <span style={{ fontSize: 15, color: '#cdd6f4' }}>
                {i + 1}. {t(`finalSurvey.methodNames.${method}`)}
              </span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => moveUp(i)} disabled={i === 0}
                  style={{ ...rankBtn, opacity: i === 0 ? 0.3 : 1 }}>↑</button>
                <button onClick={() => moveDown(i)} disabled={i === preferenceOrder.length - 1}
                  style={{ ...rankBtn, opacity: i === preferenceOrder.length - 1 ? 0.3 : 1 }}>↓</button>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={() => setStep('demographics')}
          style={{
            marginTop: 28, padding: '12px 32px', borderRadius: 8, border: 'none',
            background: '#5a7aff', color: '#fff', fontSize: 16, cursor: 'pointer', width: '100%',
          }}
        >
          {t('finalSurvey.next')}
        </button>
      </div>
    )
  }

  // step === 'demographics'
  const genderKeys = ['male', 'female', 'other', 'prefer_not'] as const
  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '32px 16px' }}>
      <h2 style={{ marginBottom: 24 }}>{t('finalSurvey.demographicsTitle')}</h2>

      <label style={labelStyle}>
        {t('finalSurvey.age')}
        <input
          type="number"
          min={10}
          max={99}
          value={age}
          onChange={e => setAge(e.target.value)}
          style={inputStyle}
          placeholder="—"
        />
      </label>

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 14, color: '#888', marginBottom: 8 }}>{t('finalSurvey.gender')}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {genderKeys.map(k => (
            <button
              key={k}
              onClick={() => setGender(k)}
              style={{
                padding: '8px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
                background: gender === k ? '#5a7aff' : '#1e1e3e',
                color: gender === k ? '#fff' : '#888', fontSize: 14,
              }}
            >
              {t(`finalSurvey.genderOptions.${k}`)}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 14, color: '#888', marginBottom: 8 }}>{t('finalSurvey.hasEyeCondition')}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {([true, false] as const).map(v => (
            <button
              key={String(v)}
              onClick={() => setHasEyeCondition(v)}
              style={{
                padding: '8px 24px', borderRadius: 6, border: 'none', cursor: 'pointer',
                background: hasEyeCondition === v ? '#5a7aff' : '#1e1e3e',
                color: hasEyeCondition === v ? '#fff' : '#888', fontSize: 14,
              }}
            >
              {v ? t('finalSurvey.yes') : t('finalSurvey.no')}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={handleFinalSubmit}
        disabled={!demoComplete}
        style={{
          padding: '12px 32px', borderRadius: 8, border: 'none',
          background: demoComplete ? '#50fa7b' : '#333',
          color: demoComplete ? '#000' : '#666',
          fontSize: 16, cursor: demoComplete ? 'pointer' : 'not-allowed', width: '100%',
        }}
      >
        {t('finalSurvey.submit')}
      </button>
    </div>
  )
}

const rankBtn: CSSProperties = {
  width: 32, height: 32, borderRadius: 4, border: '1px solid #333',
  background: 'transparent', color: '#888', fontSize: 16, cursor: 'pointer',
}

const labelStyle: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 6,
  fontSize: 14, color: '#888', marginBottom: 20,
}

const inputStyle: CSSProperties = {
  padding: '8px 12px', borderRadius: 6, border: '1px solid #333',
  background: '#1e1e3e', color: '#cdd6f4', fontSize: 16, width: 100,
}
