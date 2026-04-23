import { useState } from 'react'
import { useI18n } from '../i18n'

interface Props {
  onNext: () => void
}

export function SurveyPage({ onNext }: Props) {
  const { t } = useI18n()
  const items: string[] = t('panas.items') as unknown as string[]
  const scale: string[] = t('survey.scale') as unknown as string[]
  const [answers, setAnswers] = useState<number[]>(new Array(20).fill(0))

  const allAnswered = answers.every(a => a > 0)

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 16px' }}>
      <h2 style={{ marginBottom: 8 }}>{t('survey.title')}</h2>
      <p style={{ color: '#888', marginBottom: 24, fontSize: 13 }}>{t('survey.instruction')}</p>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, marginBottom: 8 }}>
        {scale.map((s, i) => (
          <div key={i} style={{ width: 60, textAlign: 'center', fontSize: 11, color: '#666' }}>{i + 1}<br/>{s}</div>
        ))}
      </div>

      {(items as string[]).map((item, idx) => (
        <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #222' }}>
          <span style={{ flex: 1 }}>{item}</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {[1, 2, 3, 4, 5].map(v => (
              <button
                key={v}
                onClick={() => setAnswers(a => { const n = [...a]; n[idx] = v; return n })}
                style={{
                  width: 60, height: 32, borderRadius: 4, border: 'none', cursor: 'pointer',
                  background: answers[idx] === v ? '#5a7aff' : '#1e1e3e',
                  color: answers[idx] === v ? '#fff' : '#888', fontSize: 13,
                }}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      ))}

      <button
        onClick={onNext}
        disabled={!allAnswered}
        style={{ marginTop: 24, padding: '12px 32px', borderRadius: 8, border: 'none', background: allAnswered ? '#50fa7b' : '#333', color: allAnswered ? '#000' : '#666', fontSize: 16, cursor: allAnswered ? 'pointer' : 'not-allowed', width: '100%' }}
      >
        {t('survey.submit')}
      </button>
    </div>
  )
}
