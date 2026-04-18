import { useState } from 'react'
import type { AppPage, Language } from './types'
import { I18nProvider } from './i18n'
import { DebugPage } from './pages/DebugPage'
import { WelcomePage } from './pages/WelcomePage'
import { TutorialPage } from './pages/TutorialPage'
import { ExperimentPage } from './pages/ExperimentPage'
import { SurveyPage } from './pages/SurveyPage'
import { ExportPage } from './pages/ExportPage'

export interface SessionState {
  participantId: string
  language: Language
  sessionId: string
  smileCalibPeak: number
  smileThreshold: number
  gazeOffsetX: number
  gazeOffsetY: number
}

export default function App() {
  const [page, setPage] = useState<AppPage>('debug')
  const [session, setSession] = useState<SessionState | null>(null)
  const [debugOffset, setDebugOffset] = useState({ x: 0, y: 0 })

  const goTo = (p: AppPage) => setPage(p)

  return (
    <I18nProvider>
      <div style={{ minHeight: '100vh', background: '#0d1117', color: '#cdd6f4', fontFamily: 'system-ui, sans-serif' }}>
        {page === 'debug' && (
          <DebugPage onStart={(ox, oy) => { setDebugOffset({ x: ox, y: oy }); goTo('welcome') }} />
        )}
        {page === 'welcome' && (
          <WelcomePage onNext={(s) => {
            setSession({ ...s, gazeOffsetX: debugOffset.x, gazeOffsetY: debugOffset.y })
            goTo('tutorial')
          }} />
        )}
        {page === 'tutorial' && session && (
          <TutorialPage
            participantId={session.participantId}
            gazeOffsetX={session.gazeOffsetX}
            gazeOffsetY={session.gazeOffsetY}
            onNext={(peak, threshold) => {
              setSession({ ...session, smileCalibPeak: peak, smileThreshold: threshold })
              goTo('experiment')
            }}
          />
        )}
        {page === 'experiment' && session && (
          <ExperimentPage session={session} onNext={() => goTo('survey')} />
        )}
        {page === 'survey' && session && (
          <SurveyPage sessionId={session.sessionId} onNext={() => goTo('export')} />
        )}
        {page === 'export' && session && (
          <ExportPage sessionId={session.sessionId} />
        )}
      </div>
    </I18nProvider>
  )
}
