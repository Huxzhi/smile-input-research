import { useState } from 'react'
import { v4 as uuid } from 'uuid'
import { useI18n } from '../i18n'
import type { Language } from '../types'
import type { SessionState } from '../App'

interface Props {
  onNext: (session: SessionState) => void
}

export function WelcomePage({ onNext }: Props) {
  const { t, lang, setLang } = useI18n()
  const [pid, setPid] = useState('')

  const handleStart = () => {
    if (!pid.trim()) return
    onNext({
      participantId: pid.trim(),
      language: lang,
      sessionId: uuid(),
      smileCalibPeak: 0,
      smileThreshold: 0.6,
    })
  }

  return (
    <div style={centerStyle}>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>{t('welcome.title')}</h1>

      <div style={{ display: 'flex', gap: 10 }}>
        {(['zh', 'ja', 'en'] as Language[]).map(l => (
          <button
            key={l}
            onClick={() => setLang(l)}
            style={{
              padding: '8px 20px',
              borderRadius: 6,
              border: `2px solid ${lang === l ? '#5a7aff' : '#333'}`,
              background: lang === l ? '#1e1e4e' : '#1a1a2e',
              color: lang === l ? '#fff' : '#888',
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            {l === 'zh' ? '中文' : l === 'ja' ? '日本語' : 'English'}
          </button>
        ))}
      </div>

      <input
        placeholder={t('welcome.participantId')}
        value={pid}
        onChange={e => setPid(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleStart()}
        style={{
          padding: '10px 16px',
          borderRadius: 6,
          border: '1px solid #444',
          background: '#1a1a2e',
          color: '#fff',
          fontSize: 16,
          width: 240,
          outline: 'none',
        }}
      />

      <button
        onClick={handleStart}
        disabled={!pid.trim()}
        style={{
          padding: '12px 40px',
          borderRadius: 8,
          border: 'none',
          background: pid.trim() ? '#5a7aff' : '#333',
          color: pid.trim() ? '#fff' : '#666',
          fontSize: 16,
          cursor: pid.trim() ? 'pointer' : 'not-allowed',
        }}
      >
        {t('welcome.start')}
      </button>
    </div>
  )
}

const centerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '100vh',
  gap: 20,
}
