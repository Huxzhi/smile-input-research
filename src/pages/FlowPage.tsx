import { useState, useCallback, useRef } from 'react'
import { isComplete } from '../surveys/types'
import type { SurveyAnswers } from '../surveys/types'
import { loadJSON, saveJSON, removeJSON } from '../utils/storage'
import { StepNav } from '../components/StepNav'
import { SurveyForm } from '../components/SurveyForm'
import { WelcomePage } from './WelcomePage'
import { TutorialPage } from './TutorialPage'
import { ExperimentPage } from './ExperimentPage'
import { GazeCursor } from '../components/GazeCursor'
import { DebugDrawer } from '../components/DebugDrawer'
import { ExperimentManager } from '../core/ExperimentManager'
import { useInputSource } from '../core/useInputSource'
import { PERSONAL_SURVEY, PANAS_PRE_SURVEY } from '../surveys/preSurvey'
import { FINAL_SURVEY } from '../surveys/finalSurvey'
import { useStepCache } from '../hooks/useStepCache'
import { METHOD_ZH } from '../types'
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
  onExport?: () => void
}

const allComplete = (questions: typeof PERSONAL_SURVEY, answers: SurveyAnswers) =>
  questions.every(q => isComplete(q, answers[q.id]))

const saveStep = (pid: string, step: number) =>
  saveJSON(`flow_step_${pid}`, step)

export function FlowPage({ session, addLog, onSetSession, onDone, onExport }: Props) {
  const pid = session.participantId
  const [step, setStep] = useState(session.initialFlowStep)
  const videoRef  = useRef<HTMLVideoElement>(null)
  const cursorRef = useRef<HTMLDivElement>(null)

  const { gaze, faceEvent, gazeStatus, toPixel } = useInputSource({
    gazeMode: session.gazeMode,
    offsetX:  session.gazeOffsetX ?? 0,
    offsetY:  session.gazeOffsetY ?? 0,
    videoRef,
    cursorRef,
  })

  const [conditionIndex, setConditionIndex] = useState(
    session.experimenterConfig.startConditionIndex
  )
  const [conditions, setConditions] = useState(
    () => new ExperimentManager(pid, session.experimenterConfig).getConditionOrder()
  )

  const [personalAnswers, setPersonalAnswers] = useStepCache<SurveyAnswers>(
    `step_personal_${pid}`, {}
  )
  const [preAnswers, setPreAnswers] = useStepCache<SurveyAnswers>(
    `step_presurvey_${pid}`, {}
  )

  const completedSteps = new Set(Array.from({ length: step }, (_, i) => i))

  const advance = useCallback((nextStep: number) => {
    saveStep(pid, nextStep)
    setStep(nextStep)
  }, [pid])

  const handleStepClick = (i: number) => advance(i)

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
    saveJSON(`step_calibration_${pid}`, { peak, threshold })
    onSetSession(s => ({ ...s, smileCalibPeak: peak, smileThreshold: threshold }))
    advance(4)
  }

  const handleExperimentDone = () => advance(5)

  const handleConditionAdvance = useCallback(() => {
    setConditionIndex(i => i + 1)
  }, [])

  const handleConditionJump = useCallback((i: number) => {
    setConditionIndex(i)
  }, [])

  const handleFinalSubmit = (answers: SurveyAnswers) => {
    saveJSON(`step_postsurvey_${pid}`, answers)
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
    removeJSON(`flow_step_${pid}`)
    onDone()
  }

  const postsurveyInitial = loadJSON<SurveyAnswers>(`step_postsurvey_${pid}`, {})

  const showNextBtn  = step <= 2
  const nextDisabled =
    (step === 1 && !canProceedStep1) ||
    (step === 2 && !canProceedStep2)

  const subSteps = step === 4 ? conditions.map((cond, i) => ({
    label:  `${cond.layout.toUpperCase()}/${METHOD_ZH[cond.inputMethod]}`,
    done:   i < conditionIndex,
    active: i === conditionIndex,
  })) : undefined

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <video ref={videoRef} style={{ display: 'none' }} />
      <GazeCursor ref={cursorRef} />

      <StepNav
        steps={STEPS}
        currentStep={step}
        completedSteps={completedSteps}
        onStepClick={handleStepClick}
        subSteps={subSteps}
        participantId={session.participantId}
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
            gaze={gaze}
            faceEvent={faceEvent}
            toPixel={toPixel}
            onNext={handleCalibDone}
            blinkMinMs={session.blinkMinMs ?? 150}
            blinkMaxMs={session.blinkMaxMs ?? 300}
          />
        )}

        {step === 4 && (
          <ExperimentPage
            session={session}
            gaze={gaze}
            faceEvent={faceEvent}
            toPixel={toPixel}
            addLog={addLog}
            onNext={handleExperimentDone}
            conditionIndex={conditionIndex}
            onConditionAdvance={handleConditionAdvance}
            conditions={conditions}
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

      <DebugDrawer
        videoRef={videoRef}
        faceEvent={faceEvent}
        gaze={gaze}
        gazeMode={session.gazeMode}
        gazeStatus={gazeStatus}
        offsetX={session.gazeOffsetX ?? 0}
        offsetY={session.gazeOffsetY ?? 0}
        smileThreshold={session.smileThreshold}
        blinkMinMs={session.blinkMinMs ?? 150}
        blinkMaxMs={session.blinkMaxMs ?? 300}
        conditions={step === 4 ? conditions : undefined}
        conditionIndex={step === 4 ? conditionIndex : undefined}
        onGazeModeChange={mode => onSetSession(s => ({ ...s, gazeMode: mode }))}
        onOffsetXChange={v  => onSetSession(s => ({ ...s, gazeOffsetX: v }))}
        onOffsetYChange={v  => onSetSession(s => ({ ...s, gazeOffsetY: v }))}
        onSmileThresholdChange={v => onSetSession(s => ({ ...s, smileThreshold: v }))}
        onBlinkMinChange={v => onSetSession(s => ({ ...s, blinkMinMs: v }))}
        onBlinkMaxChange={v => onSetSession(s => ({ ...s, blinkMaxMs: v }))}
        onConditionJump={step === 4 ? handleConditionJump : undefined}
        onConditionsChange={step === 4 ? setConditions : undefined}
        onExport={onExport}
      />
    </div>
  )
}
