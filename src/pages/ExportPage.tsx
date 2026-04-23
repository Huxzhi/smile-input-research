import { useEffect, useState } from 'react'
import { useI18n } from '../i18n'
import { DataStore } from '../core/DataStore'

export function ExportPage() {
  const { t } = useI18n()
  const [ready, setReady] = useState(false)
  const [csv, setCsv] = useState('')

  useEffect(() => {
    const store = new DataStore()
    store.init().then(async () => {
      const data = await store.exportCSV()
      setCsv(data)
      setReady(true)
    })
  }, [])

  const downloadCSV = () => {
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `logs_${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: 20 }}>
      <h2>{t('export.title')}</h2>
      <p style={{ color: '#50fa7b', fontSize: 20 }}>{t('export.thankYou')}</p>
      {ready && (
        <button
          onClick={downloadCSV}
          style={{ padding: '12px 32px', borderRadius: 8, border: 'none', background: '#5a7aff', color: '#fff', fontSize: 15, cursor: 'pointer' }}
        >
          {t('export.download')} — logs.csv
        </button>
      )}
    </div>
  )
}
