import { useState } from 'react'
import { v4 as uuid } from 'uuid'
import type { CSSProperties } from 'react'
import { StepNav } from '../components/StepNav'
import { SurveyForm } from '../components/SurveyForm'
import { WelcomePage } from './WelcomePage'
import { DebugPage } from './DebugPage'
import { PERSONAL_SURVEY, PANAS_PRE_SURVEY } from '../surveys/preSurvey'
import { FINAL_SURVEY } from '../surveys/finalSurvey'
import { ExperimentManager } from '../core/ExperimentManager'
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

function loadAnswers(key: string): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

function hasData(key: string): boolean {
  return Object.keys(loadAnswers(key)).length > 0
}

export function SetupPage({ addLog, displayLogs, clearLogs, onExport, onStart }: Props) {
  const [participantId, setParticipantId] = useState('')
  const [previewStep, setPreviewStep]     = useState<number | null>(null)
  const [conditionIdx, setConditionIdx]   = useState(0)
  const [gazeMode, setGazeMode]           = useState<'tobii' | 'mouse'>('tobii')
  const [offsetX, setOffsetX]             = useState(0)
  const [offsetY, setOffsetY]             = useState(0)
  const [showDebug, setShowDebug]         = useState(false)

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
    return k ? loadAnswers(k) : {}
  })()

  const handleStart = () => {
    if (!pid) return
    const sessionId = uuid()
    const conditions = new ExperimentManager(conditionIdx.toString()).getConditionOrder()
    const savedStep = (() => {
      try {
        const raw = localStorage.getItem(`flow_step_${pid}`)
        return raw ? parseInt(raw, 10) : 0
      } catch { return 0 }
    })()
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
      smileThreshold: 0.6,
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
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <StepNav
        steps={STEPS}
        currentStep={previewStep ?? -1}
        completedSteps={completedSteps}
        onStepClick={setPreviewStep}
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

      {/* Config section */}
      <div style={configSection}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16, color: '#8be9fd' }}>实验配置</h3>

        <div style={rowSt}>
          <span style={labelSt}>参与者 ID</span>
          <input
            value={participantId}
            onChange={e => setParticipantId(e.target.value)}
            placeholder="输入数字 ID"
            style={inputSt}
          />
        </div>

        <div style={rowSt}>
          <span style={labelSt}>条件顺序</span>
          <select
            value={conditionIdx}
            onChange={e => setConditionIdx(Number(e.target.value))}
            style={inputSt}
          >
            {[0, 1, 2, 3, 4, 5].map(i => (
              <option key={i} value={i}>拉丁方 {i + 1}</option>
            ))}
          </select>
        </div>

        <div style={rowSt}>
          <span style={labelSt}>追踪模式</span>
          {(['tobii', 'mouse'] as const).map(m => (
            <button key={m} onClick={() => setGazeMode(m)} style={modeBtn(gazeMode === m)}>
              {m === 'tobii' ? 'Tobii' : '鼠标模拟'}
            </button>
          ))}
        </div>

        <div style={rowSt}>
          <span style={labelSt}>视线偏移</span>
          <span style={{ fontSize: 12, color: '#555' }}>X</span>
          <input type="number" step={0.01} value={offsetX}
            onChange={e => setOffsetX(Number(e.target.value))}
            style={{ ...inputSt, width: 80 }} />
          <span style={{ fontSize: 12, color: '#555', marginLeft: 8 }}>Y</span>
          <input type="number" step={0.01} value={offsetY}
            onChange={e => setOffsetY(Number(e.target.value))}
            style={{ ...inputSt, width: 80 }} />
        </div>

        <button onClick={handleStart} disabled={!pid} style={startBtnSt(!pid)}>
          开始实验 →
        </button>

        <button onClick={() => setShowDebug(true)} style={debugToggleBtn}>
          调试面板 ▶
        </button>
      </div>

      {/* Debug panel (fullscreen overlay) */}
      {showDebug && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000 }}>
          <DebugPage
            displayLogs={displayLogs}
            addLog={addLog}
            clearLogs={clearLogs}
            onExport={onExport}
            onStart={(ox, oy, mode) => {
              setOffsetX(ox)
              setOffsetY(oy)
              setGazeMode(mode)
              setShowDebug(false)
            }}
          />
          <button
            onClick={() => setShowDebug(false)}
            style={{
              position: 'fixed', top: 8, right: 8, zIndex: 1001,
              padding: '4px 12px', borderRadius: 5, border: 'none',
              background: '#ff5555', color: '#fff', fontSize: 12, cursor: 'pointer',
            }}
          >
            关闭 ✕
          </button>
        </div>
      )}
    </div>
  )
}

const previewArea: CSSProperties = {
  flex: 1, minHeight: 280, borderBottom: '1px solid #1e2430', overflowY: 'auto',
}
const configSection: CSSProperties = {
  padding: '20px 32px', background: '#0a0d14', flexShrink: 0,
}
const rowSt: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap',
}
const labelSt: CSSProperties = {
  fontSize: 13, color: '#888', width: 72, flexShrink: 0,
}
const inputSt: CSSProperties = {
  padding: '7px 12px', borderRadius: 6, border: '1px solid #2a3040',
  background: '#0a0d12', color: '#cdd6f4', fontSize: 14, width: 160,
}
const modeBtn = (active: boolean): CSSProperties => ({
  padding: '7px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
  background: active ? '#5a7aff' : '#1e1e3e', color: active ? '#fff' : '#888', fontSize: 13,
})
const startBtnSt = (disabled: boolean): CSSProperties => ({
  marginTop: 16, padding: '12px 0', borderRadius: 8, border: 'none',
  background: disabled ? '#1e1e2e' : '#5a7aff',
  color: disabled ? '#444' : '#fff',
  fontSize: 16, cursor: disabled ? 'not-allowed' : 'pointer', width: '100%',
})

const debugToggleBtn: CSSProperties = {
  marginTop: 8, padding: '8px 0', borderRadius: 8,
  border: '1px solid #2a3050', background: 'transparent',
  color: '#6a7490', fontSize: 13, cursor: 'pointer', width: '100%',
}
