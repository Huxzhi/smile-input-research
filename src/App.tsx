import { useState, useCallback, useRef, useEffect } from 'react'
import type { AppPage, Language, EventLog, ExperimenterConfig } from './types'
import { I18nProvider } from './i18n'
import { DataStore } from './core/DataStore'
import { DebugPage } from './pages/DebugPage'
import { WelcomePage } from './pages/WelcomePage'
import { ExperimenterConfigPage } from './pages/ExperimenterConfigPage'
import { TypingTestPage } from './pages/TypingTestPage'
import { TutorialPage } from './pages/TutorialPage'
import { ExperimentPage } from './pages/ExperimentPage'
import { SurveyPage } from './pages/SurveyPage'
import { PreSurveyPage } from './pages/PreSurveyPage'


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
  const [page, setPage] = useState<AppPage>('debug')
  const [session, setSession] = useState<SessionState | null>(null)
  const [debugOffset, setDebugOffset] = useState({ x: 0, y: 0 })
  const [debugGazeMode, setDebugGazeMode] = useState<'tobii' | 'mouse'>('tobii')
  const [displayLogs, setDisplayLogs] = useState<EventLog[]>([])
  const storeRef = useRef(new DataStore())

  useEffect(() => {
    storeRef.current.init().then(async () => {
      const recent = await storeRef.current.getRecentLogs(10)
      setDisplayLogs(recent)
    })
  }, [])

  const goTo = (p: AppPage) => setPage(p)

  const addLog = useCallback((log: EventLog) => {
    setDisplayLogs(prev => [log, ...prev].slice(0, 80))
    storeRef.current.saveLog(log)
  }, [])

  const clearLogs = useCallback(() => setDisplayLogs([]), [])

  const exportCSV = useCallback(async () => {
    const csv = await storeRef.current.exportCSV()
    if (!csv) return
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `logs_${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  return (
    <I18nProvider>
      <div style={{ minHeight: '100vh', background: '#0d1117', color: '#cdd6f4', fontFamily: 'system-ui, sans-serif' }}>
        {page === 'debug' && (
          <DebugPage
            displayLogs={displayLogs}
            addLog={addLog}
            clearLogs={clearLogs}
            onExport={exportCSV}
            onStart={(ox, oy, mode) => {
              setDebugOffset({ x: ox, y: oy })
              setDebugGazeMode(mode)
              goTo('experimenter-config')
            }}
          />
        )}
        {page === 'experimenter-config' && (
          <ExperimenterConfigPage
            gazeMode={debugGazeMode}
            addLog={addLog}
            onNext={(participantId, sessionId, config) => {
              setSession({
                participantId,
                sessionId,
                language: 'zh',
                smileCalibPeak: 0,
                smileThreshold: 0.6,
                gazeOffsetX: debugOffset.x,
                gazeOffsetY: debugOffset.y,
                gazeMode: debugGazeMode,
                experimenterName: config.experimenterName,
                experimenterConfig: config,
              })
              goTo('welcome')
            }}
            onBack={() => goTo('debug')}
          />
        )}
        {page === 'welcome' && (
          <WelcomePage onNext={(lang) => {
            setSession(s => s ? { ...s, language: lang } : s)
            goTo('typing-test')
          }} />
        )}
        {page === 'typing-test' && (
          <TypingTestPage onNext={() => goTo('tutorial')} />
        )}
        {page === 'tutorial' && session && (
          <TutorialPage
            participantId={session.participantId}
            gazeOffsetX={session.gazeOffsetX}
            gazeOffsetY={session.gazeOffsetY}
            gazeMode={session.gazeMode}
            onNext={(peak, threshold) => {
              setSession(s => s ? { ...s, smileCalibPeak: peak, smileThreshold: threshold } : s)
              goTo('pre-survey')
            }}
          />
        )}
        {page === 'pre-survey' && session && (
          <PreSurveyPage
            sessionId={session.sessionId}
            participantId={session.participantId}
            addLog={addLog}
            onNext={() => goTo('experiment')}
          />
        )}
        {page === 'experiment' && session && (
          <ExperimentPage session={session} addLog={addLog} onNext={() => goTo('survey')} />
        )}
        {page === 'survey' && session && (
          <SurveyPage
            sessionId={session.sessionId}
            participantId={session.participantId}
            addLog={addLog}
            onNext={() => goTo('debug')}
          />
        )}
      </div>
    </I18nProvider>
  )
}
