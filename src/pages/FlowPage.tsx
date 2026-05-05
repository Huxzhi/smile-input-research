import { useState, useCallback } from 'react'
import type { QuestionDef, SurveyAnswers } from '../surveys/types'
import { StepNav } from '../components/StepNav'
import { SurveyForm } from '../components/SurveyForm'
import { WelcomePage } from './WelcomePage'
import { TutorialPage } from './TutorialPage'
import { ExperimentPage } from './ExperimentPage'
import { PERSONAL_SURVEY, PANAS_PRE_SURVEY } from '../surveys/preSurvey'
import { FINAL_SURVEY } from '../surveys/finalSurvey'
import { useStepCache } from '../hooks/useStepCache'
import type { EventLog } from '../types'
import type { SessionState } from '../App'

const STEPS = [
  { label: '欢迎介绍' },
  { label: '个人信息' },
  { label: '实验前问卷' },
  { label: '微笑校准' },
  { label: '6 条件实验' },
  { label: '结束问卷' },
]

interface Props {
  session: SessionState
  addLog: (log: EventLog) => void
  onSetSession: (updater: (s: SessionState) => SessionState) => void
  onDone: () => void
}

function allComplete(questions: QuestionDef[], answers: SurveyAnswers): boolean {
  return questions.every(q => {
    const v = answers[q.id]
    if (v === undefined) return false
    if (q.type === 'text') return (v as string).trim() !== ''
    if (q.type === 'likert') return (v as number) > 0
    if (q.type === 'radio') return (v as string) !== ''
    if (q.type === 'panas_batch') return (v as number[]).every(n => n > 0)
    return true
  })
}

function saveStep(pid: string, step: number) {
  try { localStorage.setItem(`flow_step_${pid}`, String(step)) } catch { /* quota */ }
}

export function FlowPage({ session, addLog, onSetSession, onDone }: Props) {
  const pid = session.participantId
  const [step, setStep] = useState(session.initialFlowStep)

  const [personalAnswers, setPersonalAnswers] = useStepCache<SurveyAnswers>(
    `step_personal_${pid}`, {}
  )
  const [preAnswers, setPreAnswers] = useStepCache<SurveyAnswers>(
    `step_presurvey_${pid}`, {}
  )

  const completedSteps = new Set(Array.from({ length: step }, (_, i) => i))
  const lockedSteps    = step === 4 ? new Set([0, 1, 2, 3, 4, 5]) : new Set<number>()

  const advance = useCallback((nextStep: number) => {
    saveStep(pid, nextStep)
    setStep(nextStep)
  }, [pid])

  const handleStepClick = (i: number) => {
    if (step !== 4) advance(i)
  }

  const canProceedStep1 = allComplete(PERSONAL_SURVEY, personalAnswers)
  const canProceedStep2 = allComplete(PANAS_PRE_SURVEY, preAnswers)

  const handleNext = () => {
    if (step === 0) {
      advance(1)
    } else if (step === 1 && canProceedStep1) {
      addLog({
        sessionId: session.sessionId,
        participantId: pid,
        ts: Date.now(),
        type: 'pre_survey',
        description: 'Personal info saved',
        age: parseInt(personalAnswers.age as string) || undefined,
        gender: personalAnswers.gender as string,
        eyeTrackerExperience: personalAnswers.eyeTracker as string,
        hasEyeCondition: personalAnswers.eyeCondition === 'yes',
      })
      advance(2)
    } else if (step === 2 && canProceedStep2) {
      addLog({
        sessionId: session.sessionId,
        participantId: pid,
        ts: Date.now(),
        type: 'pre_survey',
        description: 'Pre-experiment PANAS saved',
        panasPreAnswers: JSON.stringify(preAnswers.panas_pre),
      })
      advance(3)
    }
  }

  const handleCalibDone = (peak: number, threshold: number) => {
    try {
      localStorage.setItem(`step_calibration_${pid}`, JSON.stringify({ peak, threshold }))
    } catch { /* quota */ }
    onSetSession(s => ({ ...s, smileCalibPeak: peak, smileThreshold: threshold }))
    advance(4)
  }

  const handleExperimentDone = () => advance(5)

  const handleFinalSubmit = (answers: SurveyAnswers) => {
    try {
      localStorage.setItem(`step_postsurvey_${pid}`, JSON.stringify(answers))
    } catch { /* quota */ }
    addLog({
      sessionId: session.sessionId,
      participantId: pid,
      ts: Date.now(),
      type: 'final_survey',
      description: 'Final survey submitted',
      panasFinalAnswers: JSON.stringify(answers.panas_post),
      tamPU:  JSON.stringify({ pu1: answers.pu1,  pu2: answers.pu2,  pu3: answers.pu3  }),
      tamPEOU: JSON.stringify({ eou1: answers.eou1, eou2: answers.eou2, eou3: answers.eou3 }),
      preferenceRank: JSON.stringify(answers.preference),
    })
    try { localStorage.removeItem(`flow_step_${pid}`) } catch { /* */ }
    onDone()
  }

  const postsurveyInitial = (() => {
    try {
      const raw = localStorage.getItem(`step_postsurvey_${pid}`)
      return raw ? (JSON.parse(raw) as SurveyAnswers) : {}
    } catch { return {} }
  })()

  const showNextBtn   = step <= 2
  const nextDisabled  =
    (step === 1 && !canProceedStep1) ||
    (step === 2 && !canProceedStep2)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <StepNav
        steps={STEPS}
        currentStep={step}
        completedSteps={completedSteps}
        lockedSteps={lockedSteps}
        onStepClick={handleStepClick}
      />

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {step === 0 && <WelcomePage onNext={() => {}} />}

        {step === 1 && (
          <SurveyForm
            title="个人信息"
            subtitle="请填写您的基本信息"
            questions={PERSONAL_SURVEY}
            initialAnswers={personalAnswers}
            showSubmit={false}
            onChange={setPersonalAnswers}
            onSubmit={() => {}}
          />
        )}

        {step === 2 && (
          <SurveyForm
            title="实验前问卷"
            subtitle="请评估您当前的感受"
            questions={PANAS_PRE_SURVEY}
            initialAnswers={preAnswers}
            showSubmit={false}
            onChange={setPreAnswers}
            onSubmit={() => {}}
          />
        )}

        {step === 3 && (
          <TutorialPage
            participantId={pid}
            gazeOffsetX={session.gazeOffsetX}
            gazeOffsetY={session.gazeOffsetY}
            gazeMode={session.gazeMode}
            onNext={handleCalibDone}
          />
        )}

        {step === 4 && (
          <ExperimentPage
            session={session}
            addLog={addLog}
            onNext={handleExperimentDone}
          />
        )}

        {step === 5 && (
          <SurveyForm
            title="结束问卷"
            subtitle="感谢您的参与！请填写最终问卷"
            questions={FINAL_SURVEY}
            initialAnswers={postsurveyInitial}
            submitLabel="提交并完成实验"
            onSubmit={handleFinalSubmit}
          />
        )}
      </div>

      {showNextBtn && (
        <div style={{
          padding: '12px 24px', borderTop: '1px solid #1e2430',
          background: '#0a0d14', textAlign: 'right', flexShrink: 0,
        }}>
          <button
            onClick={handleNext}
            disabled={nextDisabled}
            style={{
              padding: '10px 32px', borderRadius: 8, border: 'none',
              background: nextDisabled ? '#1e1e2e' : '#5a7aff',
              color: nextDisabled ? '#444' : '#fff',
              fontSize: 15, cursor: nextDisabled ? 'not-allowed' : 'pointer',
            }}
          >
            下一步 →
          </button>
        </div>
      )}
    </div>
  )
}
