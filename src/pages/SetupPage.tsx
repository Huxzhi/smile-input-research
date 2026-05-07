import { useState, useRef } from 'react'
import { v4 as uuid } from 'uuid'
import type { CSSProperties } from 'react'
import { StepNav } from '../components/StepNav'
import { SurveyForm } from '../components/SurveyForm'
import { WelcomePage } from './WelcomePage'
import { DebugDrawer } from '../components/DebugDrawer'
import { GazeCursor } from '../components/GazeCursor'
import { PERSONAL_SURVEY, PANAS_PRE_SURVEY } from '../surveys/preSurvey'
import { FINAL_SURVEY } from '../surveys/finalSurvey'
import { ExperimentManager } from '../core/ExperimentManager'
import { useInputSource } from '../core/useInputSource'
import { loadJSON } from '../utils/storage'
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
  addLog: (log: EventLog) => void
  displayLogs: EventLog[]
  clearLogs: () => void
  onExport: () => void
  onStart: (session: SessionState) => void
}

const hasData = (key: string) =>
  Object.keys(loadJSON(key, {})).length > 0

export function SetupPage({ addLog, onStart, onExport }: Props) {
  const [participantId, setParticipantId] = useState('')
  const [previewStep, setPreviewStep]     = useState<number | null>(null)
  const [conditionIdx, setConditionIdx]   = useState(0)
  const [gazeMode, setGazeMode]           = useState<'tobii' | 'mouse'>('tobii')
  const [offsetX, setOffsetX]             = useState(0)
  const [offsetY, setOffsetY]             = useState(0)
  const [smileThreshold, setSmileThreshold] = useState(0.6)
  const [blinkMinMs, setBlinkMinMs]         = useState(150)
  const [blinkMaxMs, setBlinkMaxMs]         = useState(300)

  const videoRef  = useRef<HTMLVideoElement>(null)
  const cursorRef = useRef<HTMLDivElement>(null)

  const { faceEvent, gaze, gazeStatus } = useInputSource({
    gazeMode, offsetX, offsetY, videoRef, cursorRef,
  })

  const pid = participantId.trim()

  const completedSteps = new Set<number>(
    pid
      ? ([
          hasData(`step_personal_${pid}`)     ? 1 : -1,
          hasData(`step_presurvey_${pid}`)    ? 2 : -1,
          hasData(`step_calibration_${pid}`)  ? 3 : -1,
        ] as number[]).filter(n => n >= 0)
      : []
  )

  const previewAnswers = ((): Record<string, unknown> => {
    if (previewStep === null || !pid) return {}
    const keyMap: Partial<Record<number, string>> = {
      1: `step_personal_${pid}`,
      2: `step_presurvey_${pid}`,
      5: `step_postsurvey_${pid}`,
    }
    const k = keyMap[previewStep]
    return k ? loadJSON(k, {}) : {}
  })()

  const handleStart = () => {
    if (!pid) return
    const sessionId = uuid()
    const conditions = new ExperimentManager(conditionIdx.toString()).getConditionOrder()
    const savedStep = loadJSON(`flow_step_${pid}`, 0)
    const orderStr = conditions.map(c => `${c.layout}/${c.inputMethod}`).join(', ')
    addLog({
      sessionId, ts: Date.now(), type: 'experiment_start',
      description: `P${pid} 顺序:[${orderStr}]`,
      participantId: pid,
      conditionOrder: JSON.stringify(conditions),
      startConditionIndex: 0, startPhraseIndex: 0, phrasesPerCondition: 15,
      gazeMode,
    })
    onStart({
      participantId: pid,
      sessionId,
      language: 'zh',
      smileCalibPeak: 0,
      smileThreshold,
      blinkMinMs,
      blinkMaxMs,
      gazeOffsetX: offsetX,
      gazeOffsetY: offsetY,
      gazeMode,
      experimenterName: '',
      experimenterConfig: {
        experimenterName: '',
        conditionOrder: conditions,
        startConditionIndex: 0,
        startPhraseIndex: 0,
        phrasesPerCondition: 15,
      },
      initialFlowStep: savedStep,
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <video ref={videoRef} style={{ display: 'none' }} />
      <GazeCursor ref={cursorRef} />

      <StepNav
        steps={STEPS}
        currentStep={previewStep ?? -1}
        completedSteps={completedSteps}
        onStepClick={setPreviewStep}
        participantId={participantId}
        onParticipantIdChange={setParticipantId}
        conditionIdx={conditionIdx}
        onConditionIdxChange={setConditionIdx}
      />

      {/* Preview area */}
      <div style={previewArea}>
        {previewStep === null && (
          <p style={{ color: '#555', textAlign: 'center', paddingTop: 48, fontSize: 14 }}>
            点击上方步骤按钮预览对应内容
          </p>
        )}
        {previewStep === 0 && <WelcomePage onNext={() => {}} />}
        {previewStep === 1 && (
          <SurveyForm
            title="个人信息" questions={PERSONAL_SURVEY}
            initialAnswers={previewAnswers} showSubmit={false} onSubmit={() => {}}
          />
        )}
        {previewStep === 2 && (
          <SurveyForm
            title="实验前问卷 (PANAS)" questions={PANAS_PRE_SURVEY}
            initialAnswers={previewAnswers} showSubmit={false} onSubmit={() => {}}
          />
        )}
        {previewStep === 3 && (
          <p style={{ color: '#888', textAlign: 'center', paddingTop: 48, fontSize: 14 }}>
            微笑校准（实验流程中进行）
          </p>
        )}
        {previewStep === 4 && (
          <p style={{ color: '#888', textAlign: 'center', paddingTop: 48, fontSize: 14 }}>
            6 条件实验（实验流程中进行）
          </p>
        )}
        {previewStep === 5 && (
          <SurveyForm
            title="结束问卷" questions={FINAL_SURVEY}
            initialAnswers={previewAnswers} showSubmit={false} onSubmit={() => {}}
          />
        )}
      </div>

      {/* Start button */}
      <div style={startBar}>
        <button onClick={handleStart} disabled={!pid} style={startBtnSt(!pid)}>
          开始实验 →
        </button>
      </div>

      <DebugDrawer
        videoRef={videoRef}
        faceEvent={faceEvent}
        gaze={gaze}
        gazeMode={gazeMode}
        gazeStatus={gazeStatus}
        offsetX={offsetX}
        offsetY={offsetY}
        smileThreshold={smileThreshold}
        blinkMinMs={blinkMinMs}
        blinkMaxMs={blinkMaxMs}
        onGazeModeChange={setGazeMode}
        onOffsetXChange={setOffsetX}
        onOffsetYChange={setOffsetY}
        onSmileThresholdChange={setSmileThreshold}
        onBlinkMinChange={setBlinkMinMs}
        onBlinkMaxChange={setBlinkMaxMs}
        onExport={onExport}
      />
    </div>
  )
}

const previewArea: CSSProperties = {
  flex: 1, minHeight: 0, borderBottom: '1px solid #1e2430', overflowY: 'auto',
}

const startBar: CSSProperties = {
  padding: '12px 32px', background: '#0a0d14', flexShrink: 0,
  borderTop: '1px solid #1e2430',
}

const startBtnSt = (disabled: boolean): CSSProperties => ({
  padding: '12px 0', borderRadius: 8, border: 'none', width: '100%',
  background: disabled ? '#1e1e2e' : '#5a7aff',
  color: disabled ? '#444' : '#fff',
  fontSize: 16, cursor: disabled ? 'not-allowed' : 'pointer',
})
