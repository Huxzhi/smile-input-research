import { useState, useCallback, useRef, useEffect } from 'react'
import type { Language, EventLog, ExperimenterConfig } from './types'
import { I18nProvider } from './i18n'
import { DataStore } from './core/DataStore'
import { SetupPage } from './pages/SetupPage'
import { FlowPage } from './pages/FlowPage'

export interface SessionState {
  participantId: string
  language: Language
  sessionId: string
  smileCalibPeak: number
  smileThreshold: number
  blinkMinMs: number
  blinkMaxMs: number
  gazeOffsetX: number
  gazeOffsetY: number
  gazeMode: 'tobii' | 'mouse'
  experimenterName: string
  experimenterConfig: ExperimenterConfig
  initialFlowStep: number
}

export default function App() {
  const [mode, setMode]             = useState<'setup' | 'flow'>('setup')
  const [session, setSession]       = useState<SessionState | null>(null)
  const [displayLogs, setDisplayLogs] = useState<EventLog[]>([])
  const storeRef                    = useRef(new DataStore())

  useEffect(() => {
    storeRef.current.init().then(async () => {
      const recent = await storeRef.current.getRecentLogs(10)
      setDisplayLogs(recent)
    })
  }, [])

  const addLog = useCallback((log: EventLog) => {
    setDisplayLogs(prev => [log, ...prev].slice(0, 80))
    storeRef.current.saveLog(log)
  }, [])

  const clearLogs = useCallback(() => setDisplayLogs([]), [])

  const exportCSV = useCallback(async () => {
    const csv = await storeRef.current.exportCSV()
    if (!csv) return
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `logs_${Date.now()}.csv`; a.click()
    URL.revokeObjectURL(url)
  }, [])

  return (
    <I18nProvider>
      <div style={{ minHeight: '100vh', background: '#0d1117', color: '#cdd6f4', fontFamily: 'system-ui, sans-serif' }}>
        {mode === 'setup' && (
          <SetupPage
            addLog={addLog}
            displayLogs={displayLogs}
            clearLogs={clearLogs}
            onExport={exportCSV}
            onStart={s => { setSession(s); setMode('flow') }}
          />
        )}
        {mode === 'flow' && session && (
          <FlowPage
            session={session}
            addLog={addLog}
            onSetSession={updater => setSession(s => s ? updater(s) : s)}
            onDone={() => { setSession(null); setMode('setup') }}
            onExport={exportCSV}
          />
        )}
      </div>
    </I18nProvider>
  )
}
