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
  gazeOffsetX: number
  gazeOffsetY: number
  gazeMode: 'tobii' | 'mouse'
  experimenterName: string
  experimenterConfig: ExperimenterConfig
  initialFlowStep: number
}

export default function App() {
  const [mode, setMode]       = useState<'setup' | 'flow'>('setup')
  const [session, setSession] = useState<SessionState | null>(null)
  const storeRef              = useRef(new DataStore())

  useEffect(() => { storeRef.current.init() }, [])

  const addLog = useCallback((log: EventLog) => {
    storeRef.current.saveLog(log)
  }, [])

  return (
    <I18nProvider>
      <div style={{ minHeight: '100vh', background: '#0d1117', color: '#cdd6f4', fontFamily: 'system-ui, sans-serif' }}>
        {mode === 'setup' && (
          <SetupPage
            addLog={addLog}
            onStart={s => { setSession(s); setMode('flow') }}
          />
        )}
        {mode === 'flow' && session && (
          <FlowPage
            session={session}
            addLog={addLog}
            onSetSession={updater => setSession(s => s ? updater(s) : s)}
            onDone={() => { setSession(null); setMode('setup') }}
          />
        )}
      </div>
    </I18nProvider>
  )
}
