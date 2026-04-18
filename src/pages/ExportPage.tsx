import { useEffect, useState } from 'react'
import { useI18n } from '../i18n'
import { DataStore } from '../core/DataStore'

interface Props {
  sessionId: string
}

export function ExportPage({ sessionId }: Props) {
  const { t } = useI18n()
  const [ready, setReady] = useState(false)
  const [csvData, setCsvData] = useState<{ sessions: string; phrases: string; events: string; raw: string; surveys: string } | null>(null)

  useEffect(() => {
    const store = new DataStore()
    store.init().then(async () => {
      const data = await store.exportCSV(sessionId)
      setCsvData(data)
      setReady(true)
    })
  }, [sessionId])

  const downloadCSV = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: 20 }}>
      <h2>{t('export.title')}</h2>
      <p style={{ color: '#50fa7b', fontSize: 20 }}>{t('export.thankYou')}</p>
      {ready && csvData && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(['sessions', 'phrases', 'events', 'raw', 'surveys'] as const).map(key => (
            <button
              key={key}
              onClick={() => downloadCSV(csvData[key], `${sessionId}_${key}.csv`)}
              style={{ padding: '12px 32px', borderRadius: 8, border: 'none', background: '#5a7aff', color: '#fff', fontSize: 15, cursor: 'pointer' }}
            >
              {t('export.download')} — {key}.csv
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
