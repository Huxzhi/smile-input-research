import { useState, useEffect } from 'react'
import { useI18n } from '../i18n'

interface Props {
  onNext: () => void
}

export function DeviceCheckPage({ onNext }: Props) {
  const { t } = useI18n()
  const [cameraOk, setCameraOk] = useState<boolean | null>(null)
  const [tobiiOk, setTobiiOk] = useState<boolean | null>(null)

  useEffect(() => {
    // Check camera — navigator.mediaDevices is only available in secure contexts
    // (HTTPS or localhost). Accessing via plain HTTP on an IP will make it undefined.
    if (!navigator.mediaDevices) {
      setCameraOk(false)
    } else {
      navigator.mediaDevices.getUserMedia({ video: true })
        .then(stream => {
          stream.getTracks().forEach(t => t.stop())
          setCameraOk(true)
        })
        .catch(() => setCameraOk(false))
    }

    // Check Tobii WebSocket
    const ws = new WebSocket('ws://localhost:7070')
    ws.onopen = () => { setTobiiOk(true); ws.close() }
    ws.onerror = () => setTobiiOk(false)

    return () => {
      if (ws.readyState === WebSocket.CONNECTING) ws.close()
    }
  }, [])

  const canContinue = cameraOk === true && tobiiOk === true

  return (
    <div style={centerStyle}>
      <h1>{t('deviceCheck.title')}</h1>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: 360 }}>
        <StatusRow
          label={t('deviceCheck.camera')}
          status={cameraOk}
          okText={t('deviceCheck.cameraOk')}
          errText={t('deviceCheck.cameraError')}
        />
        <StatusRow
          label={t('deviceCheck.tobii')}
          status={tobiiOk}
          okText={t('deviceCheck.tobiiOk')}
          errText={t('deviceCheck.tobiiError')}
        />
      </div>

      <p style={{ color: '#888', fontSize: 13, maxWidth: 400, textAlign: 'center', lineHeight: 1.6 }}>
        {t('deviceCheck.tobiiReminder')}
      </p>

      <button
        onClick={onNext}
        disabled={!canContinue}
        style={{
          padding: '12px 40px',
          borderRadius: 8,
          border: 'none',
          background: canContinue ? '#50fa7b' : '#333',
          color: canContinue ? '#000' : '#666',
          fontSize: 16,
          cursor: canContinue ? 'pointer' : 'not-allowed',
        }}
      >
        {t('deviceCheck.next')}
      </button>
    </div>
  )
}

function StatusRow({
  label,
  status,
  okText,
  errText,
}: {
  label: string
  status: boolean | null
  okText: string
  errText: string
}) {
  const color = status === null ? '#888' : status ? '#50fa7b' : '#ff6b6b'
  const text = status === null ? '...' : status ? okText : errText

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 16px',
        background: '#1a1a2e',
        borderRadius: 6,
        border: `1px solid ${color}`,
      }}
    >
      <span>{label}</span>
      <span style={{ color }}>{text}</span>
    </div>
  )
}

const centerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '100vh',
  gap: 24,
}
