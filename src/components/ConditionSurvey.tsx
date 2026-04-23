import { useState } from 'react'
import { useI18n } from '../i18n'
import type { Layout, InputMethod } from '../types'

export interface ConditionSurveyAnswers {
  tlxMental: number
  tlxPhysical: number
  tlxTemporal: number
  tlxPerformance: number
  tlxEffort: number
  tlxHappiness: number
  smileNaturalness: number | null
  smileEmbarrassment: number | null
}

interface Props {
  conditionIndex: number
  layout: Layout
  inputMethod: InputMethod
  onSubmit: (answers: ConditionSurveyAnswers) => void
}

const TLX_KEYS = ['mental', 'physical', 'temporal', 'performance', 'effort', 'happiness'] as const
type TLXKey = typeof TLX_KEYS[number]

const METHOD_ZH: Record<InputMethod, string> = { dwell: '注视', blink: '眨眼', smile: '微笑' }

export function ConditionSurvey({ conditionIndex, layout, inputMethod, onSubmit }: Props) {
  const { t } = useI18n()
  const [tlx, setTlx] = useState<Record<TLXKey, number>>({
    mental: 0, physical: 0, temporal: 0, performance: 0, effort: 0, happiness: 0,
  })
  const [smileNat, setSmileNat] = useState(0)
  const [smileEmb, setSmileEmb] = useState(0)

  const isSmile = inputMethod === 'smile'
  const tlxDone = TLX_KEYS.every(k => tlx[k] > 0)
  const smileDone = !isSmile || (smileNat > 0 && smileEmb > 0)
  const canSubmit = tlxDone && smileDone

  const handleSubmit = () => {
    if (!canSubmit) return
    onSubmit({
      tlxMental:      tlx.mental,
      tlxPhysical:    tlx.physical,
      tlxTemporal:    tlx.temporal,
      tlxPerformance: tlx.performance,
      tlxEffort:      tlx.effort,
      tlxHappiness:   tlx.happiness,
      smileNaturalness:   isSmile ? smileNat : null,
      smileEmbarrassment: isSmile ? smileEmb : null,
    })
  }

  const smileScaleLo = t('conditionSurvey.smileScale.0')
  const smileScaleHi = t('conditionSurvey.smileScale.4')

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '32px 16px' }}>
      <h2 style={{ marginBottom: 4 }}>{t('conditionSurvey.title')}</h2>
      <p style={{ color: '#888', marginBottom: 24, fontSize: 13 }}>
        {t('conditionSurvey.subtitle', {
          index: String(conditionIndex + 1),
          layout: layout.toUpperCase(),
          method: METHOD_ZH[inputMethod],
        })}
      </p>

      {TLX_KEYS.map(key => (
        <ScaleRow
          key={key}
          label={t(`conditionSurvey.tlx.${key}.label`)}
          lo={t(`conditionSurvey.tlx.${key}.lo`)}
          hi={t(`conditionSurvey.tlx.${key}.hi`)}
          points={7}
          value={tlx[key]}
          onChange={v => setTlx(prev => ({ ...prev, [key]: v }))}
        />
      ))}

      {isSmile && (
        <>
          <p style={{ color: '#f1fa8c', marginTop: 20, marginBottom: 4, fontSize: 13 }}>微笑输入专项</p>
          <ScaleRow
            label={t('conditionSurvey.smileNaturalness')}
            lo={smileScaleLo}
            hi={smileScaleHi}
            points={5}
            value={smileNat}
            onChange={setSmileNat}
          />
          <ScaleRow
            label={t('conditionSurvey.smileEmbarrassment')}
            lo={smileScaleLo}
            hi={smileScaleHi}
            points={5}
            value={smileEmb}
            onChange={setSmileEmb}
          />
        </>
      )}

      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        style={{
          marginTop: 28, padding: '12px 32px', borderRadius: 8, border: 'none',
          background: canSubmit ? '#50fa7b' : '#333',
          color: canSubmit ? '#000' : '#666',
          fontSize: 16, cursor: canSubmit ? 'pointer' : 'not-allowed', width: '100%',
        }}
      >
        {t('conditionSurvey.submit')}
      </button>
    </div>
  )
}

function ScaleRow({ label, lo, hi, points, value, onChange }: {
  label: string
  lo: string
  hi: string
  points: number
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 0', borderBottom: '1px solid #1e1e3e' }}>
      <span style={{ fontSize: 14, color: '#cdd6f4' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, color: '#555', width: 72, textAlign: 'right', flexShrink: 0 }}>{lo}</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {Array.from({ length: points }, (_, i) => i + 1).map(v => (
            <button
              key={v}
              onClick={() => onChange(v)}
              style={{
                width: 38, height: 34, borderRadius: 4, border: 'none', cursor: 'pointer',
                background: value === v ? '#5a7aff' : '#1e1e3e',
                color: value === v ? '#fff' : '#666', fontSize: 13,
              }}
            >{v}</button>
          ))}
        </div>
        <span style={{ fontSize: 11, color: '#555', width: 72, flexShrink: 0 }}>{hi}</span>
      </div>
    </div>
  )
}
