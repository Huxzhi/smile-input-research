import { useI18n } from '../i18n'
import type { Language } from '../types'

interface Props {
  onNext: (language: Language) => void
}

export function WelcomePage({ onNext }: Props) {
  const { t, lang, setLang } = useI18n()

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

      <button
        onClick={() => onNext(lang)}
        style={{
          padding: '12px 40px',
          borderRadius: 8,
          border: 'none',
          background: '#5a7aff',
          color: '#fff',
          fontSize: 16,
          cursor: 'pointer',
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
