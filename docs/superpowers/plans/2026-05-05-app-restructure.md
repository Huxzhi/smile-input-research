# App 双页重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure App from an 8-page state machine to two views (SetupPage + FlowPage) with a persistent 6-step navigator, localStorage-backed form state, and a clean participant-facing experiment flow.

**Architecture:** `App.tsx` holds `'setup' | 'flow'` mode. `SetupPage` provides participant ID input, step preview, and gaze config. `FlowPage` runs the 6-step experiment linearly using `StepNav` + per-step `useStepCache` for localStorage persistence. Form data → localStorage; experiment events → IndexedDB (unchanged).

**Tech Stack:** React 18, TypeScript, uuid, localStorage (form state), IndexedDB via DataStore (experiment events)

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Modify | `src/components/SurveyForm.tsx` | Add `onChange` and `showSubmit` props |
| Modify | `src/surveys/preSurvey.ts` | Export `PERSONAL_SURVEY` and `PANAS_PRE_SURVEY` separately |
| Create | `src/hooks/useStepCache.ts` | Debounced localStorage read/write hook |
| Create | `src/components/StepNav.tsx` | Reusable step navigation bar |
| Create | `src/pages/SetupPage.tsx` | Setup view: step preview + participant config |
| Create | `src/pages/FlowPage.tsx` | Flow view: 6-step experiment runner |
| Modify | `src/App.tsx` | Two-state machine: `'setup' \| 'flow'` |
| Modify | `src/types.ts` | Remove `AppPage` type |
| Delete | `src/pages/ExperimenterConfigPage.tsx` | Merged into SetupPage |
| Delete | `src/pages/PreSurveyPage.tsx` | Replaced by FlowPage steps 1+2 |
| Delete | `src/pages/SurveyPage.tsx` | Replaced by FlowPage step 5 |
| Delete | `src/pages/TypingTestPage.tsx` | Removed from flow |

---

### Task 1: Add `onChange` and `showSubmit` to SurveyForm

**Files:**
- Modify: `src/components/SurveyForm.tsx`

- [ ] **Step 1: Update Props interface and component body**

In `src/components/SurveyForm.tsx`, replace the `Props` interface and the `set` helper and the submit button:

```tsx
interface Props {
  title?: string
  subtitle?: string
  questions: QuestionDef[]
  initialAnswers?: Partial<SurveyAnswers>
  submitLabel?: string
  showSubmit?: boolean                         // NEW — default true
  onChange?: (answers: SurveyAnswers) => void  // NEW — called on every answer change
  onSubmit: (answers: SurveyAnswers) => void
}
```

Change the `set` helper (currently line 45–46) to call `onChange`:

```tsx
const set = (id: string, val: SurveyAnswers[string]) =>
  setAnswers(prev => {
    const next = { ...prev, [id]: val }
    onChange?.(next)
    return next
  })
```

Wrap the submit button in a conditional (currently line 64–75):

```tsx
{(showSubmit ?? true) && (
  <button
    onClick={() => canSubmit && onSubmit(answers)}
    disabled={!canSubmit}
    style={{
      marginTop: 28, padding: '12px 32px', borderRadius: 8, border: 'none',
      background: canSubmit ? '#50fa7b' : '#333',
      color: canSubmit ? '#000' : '#666',
      fontSize: 16, cursor: canSubmit ? 'pointer' : 'not-allowed', width: '100%',
    }}
  >
    {submitLabel}
  </button>
)}
```

- [ ] **Step 2: Type check**

Run: `pnpm tsc --noEmit`
Expected: no new errors (existing build errors are pre-existing and unrelated)

- [ ] **Step 3: Commit**

```bash
git add src/components/SurveyForm.tsx
git commit -m "feat: add onChange and showSubmit props to SurveyForm"
```

---

### Task 2: Split pre-survey config into personal + PANAS_pre

**Files:**
- Modify: `src/surveys/preSurvey.ts`

- [ ] **Step 1: Add named exports for the two sub-surveys**

Append to the end of `src/surveys/preSurvey.ts`:

```ts
// Demographic questions only (no PANAS)
export const PERSONAL_SURVEY: QuestionDef[] = PRE_SURVEY.filter(
  q => q.type !== 'panas_batch'
)

// PANAS pre-experiment batch only
export const PANAS_PRE_SURVEY: QuestionDef[] = PRE_SURVEY.filter(
  q => q.type === 'panas_batch'
)
```

- [ ] **Step 2: Type check**

Run: `pnpm tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/surveys/preSurvey.ts
git commit -m "feat: export PERSONAL_SURVEY and PANAS_PRE_SURVEY from preSurvey"
```

---

### Task 3: Create `useStepCache` hook

**Files:**
- Create: `src/hooks/useStepCache.ts`

- [ ] **Step 1: Create the hook file**

Create `src/hooks/useStepCache.ts`:

```ts
import { useState, useEffect, useRef } from 'react'

export function useStepCache<T>(key: string, initial: T): [T, (val: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw ? (JSON.parse(raw) as T) : initial
    } catch {
      return initial
    }
  })

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const set = (val: T) => {
    setValue(val)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      try { localStorage.setItem(key, JSON.stringify(val)) } catch { /* quota */ }
    }, 300)
  }

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  return [value, set]
}
```

- [ ] **Step 2: Type check**

Run: `pnpm tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useStepCache.ts
git commit -m "feat: add useStepCache hook for debounced localStorage sync"
```

---

### Task 4: Create `StepNav` component

**Files:**
- Create: `src/components/StepNav.tsx`

- [ ] **Step 1: Create StepNav**

Create `src/components/StepNav.tsx`:

```tsx
import type { CSSProperties } from 'react'

interface Props {
  steps: { label: string }[]
  currentStep: number
  completedSteps: Set<number>
  lockedSteps?: Set<number>
  onStepClick: (index: number) => void
}

export function StepNav({
  steps, currentStep, completedSteps, lockedSteps = new Set(), onStepClick,
}: Props) {
  return (
    <div style={navBar}>
      {steps.map((s, i) => {
        const isCompleted = completedSteps.has(i)
        const isCurrent   = i === currentStep
        const isLocked    = lockedSteps.has(i)
        const canClick    = (isCompleted || isCurrent) && !isLocked

        return (
          <button
            key={i}
            onClick={() => canClick && onStepClick(i)}
            style={stepBtn(isCurrent, isCompleted, isLocked, canClick)}
          >
            <span style={{ fontSize: 11, marginRight: 4 }}>
              {isCompleted ? '✓' : i + 1}
            </span>
            {s.label}
          </button>
        )
      })}
    </div>
  )
}

const navBar: CSSProperties = {
  display: 'flex', gap: 4, padding: '8px 12px',
  background: '#0a0d14', borderBottom: '1px solid #1e2430',
  overflowX: 'auto', flexShrink: 0,
}

const stepBtn = (
  current: boolean, completed: boolean, locked: boolean, canClick: boolean,
): CSSProperties => ({
  padding: '6px 14px', borderRadius: 6, border: 'none',
  fontSize: 13, cursor: canClick ? 'pointer' : 'default', whiteSpace: 'nowrap',
  background: current ? '#5a7aff' : completed ? '#1a3a1a' : '#0d1117',
  color: current ? '#fff' : completed ? '#50fa7b' : locked ? '#2a2a3a' : '#555',
  opacity: locked ? 0.5 : 1,
  transition: 'background 150ms',
})
```

- [ ] **Step 2: Type check**

Run: `pnpm tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/StepNav.tsx
git commit -m "feat: add reusable StepNav component"
```

---

### Task 5: Create `SetupPage`

**Files:**
- Create: `src/pages/SetupPage.tsx`

SetupPage layout:
1. `StepNav` (preview mode — clicking shows that step's form/info)
2. Step preview area (renders clicked step component with saved data for current participantId)
3. Config section: participantId, gaze mode, gaze offset, condition order, "开始实验" button

- [ ] **Step 1: Create SetupPage**

Create `src/pages/SetupPage.tsx`:

```tsx
import { useState } from 'react'
import { v4 as uuid } from 'uuid'
import type { CSSProperties } from 'react'
import { StepNav } from '../components/StepNav'
import { SurveyForm } from '../components/SurveyForm'
import { WelcomePage } from './WelcomePage'
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

export function SetupPage({ addLog, onStart }: Props) {
  const [participantId, setParticipantId] = useState('')
  const [previewStep, setPreviewStep]     = useState<number | null>(null)
  const [conditionIdx, setConditionIdx]   = useState(0)
  const [gazeMode, setGazeMode]           = useState<'tobii' | 'mouse'>('tobii')
  const [offsetX, setOffsetX]             = useState(0)
  const [offsetY, setOffsetY]             = useState(0)

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
    // Use conditionIdx to select one of the 6 Latin-square orderings
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

        <div style={row}>
          <span style={label}>参与者 ID</span>
          <input
            value={participantId}
            onChange={e => setParticipantId(e.target.value)}
            placeholder="输入数字 ID"
            style={inputSt}
          />
        </div>

        <div style={row}>
          <span style={label}>条件顺序</span>
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

        <div style={row}>
          <span style={label}>追踪模式</span>
          {(['tobii', 'mouse'] as const).map(m => (
            <button key={m} onClick={() => setGazeMode(m)} style={modeBtn(gazeMode === m)}>
              {m === 'tobii' ? 'Tobii' : '鼠标模拟'}
            </button>
          ))}
        </div>

        <div style={row}>
          <span style={label}>视线偏移</span>
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
      </div>
    </div>
  )
}

const previewArea: CSSProperties = {
  flex: 1, minHeight: 280, borderBottom: '1px solid #1e2430',
  overflowY: 'auto',
}
const configSection: CSSProperties = {
  padding: '20px 32px', background: '#0a0d14', flexShrink: 0,
}
const row: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap',
}
const label: CSSProperties = {
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
```

- [ ] **Step 2: Add `initialFlowStep` to `SessionState` in `App.tsx`**

In `src/App.tsx`, add `initialFlowStep: number` to the `SessionState` interface:

```ts
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
  initialFlowStep: number   // ← add this
}
```

- [ ] **Step 3: Type check**

Run: `pnpm tsc --noEmit`
Expected: no new errors

- [ ] **Step 4: Commit**

```bash
git add src/pages/SetupPage.tsx src/App.tsx
git commit -m "feat: add SetupPage with step preview and participant config"
```

---

### Task 6: Create `FlowPage`

**Files:**
- Create: `src/pages/FlowPage.tsx`

FlowPage runs the 6 experiment steps. It:
- Restores step index from `flow_step_{pid}` on mount
- Persists step index to `flow_step_{pid}` on every advance
- Uses `useStepCache` for form step data
- Passes `onNext` to TutorialPage (saves calibration + advances)
- Passes `onNext` to ExperimentPage (advances to step 5)
- On step 5 submit: logs to IndexedDB, then returns to setup

Steps 0, 1, 2 have a "下一步" button controlled by FlowPage.
Steps 3, 4 have internal completion handling (TutorialPage/ExperimentPage call `onNext`).
Step 5 has a submit button inside SurveyForm (showSubmit=true, onSubmit → log + goto setup).

- [ ] **Step 1: Create FlowPage**

Create `src/pages/FlowPage.tsx`:

```tsx
import { useState, useCallback } from 'react'
import type { SurveyAnswers } from '../surveys/types'
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

function allComplete(questions: typeof PERSONAL_SURVEY, answers: Record<string, unknown>): boolean {
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
  // Lock all steps during experiment (step 4) to prevent navigation away
  const lockedSteps = step === 4 ? new Set([0, 1, 2, 3, 4, 5]) : new Set<number>()

  const advance = useCallback((nextStep: number) => {
    saveStep(pid, nextStep)
    setStep(nextStep)
  }, [pid])

  const handleStepClick = (i: number) => {
    if (step !== 4) advance(i)
  }

  // Step completion guards for "下一步" button
  const canProceedStep1 = allComplete(PERSONAL_SURVEY, personalAnswers)
  const canProceedStep2 = allComplete(PANAS_PRE_SURVEY, preAnswers)

  const handleNext = () => {
    if (step === 0) advance(1)
    else if (step === 1 && canProceedStep1) {
      // Save personal survey to log
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
    }
    else if (step === 2 && canProceedStep2) {
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
      tamPU: JSON.stringify({ pu1: answers.pu1, pu2: answers.pu2, pu3: answers.pu3 }),
      tamPEOU: JSON.stringify({ eou1: answers.eou1, eou2: answers.eou2, eou3: answers.eou3 }),
      preferenceRank: JSON.stringify(answers.preference),
    })
    // Clear flow step so next run starts fresh
    try { localStorage.removeItem(`flow_step_${pid}`) } catch { /* */ }
    onDone()
  }

  const showNextBtn = step <= 2
  const nextDisabled =
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

      <div style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
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
            initialAnswers={(() => {
              try {
                const raw = localStorage.getItem(`step_postsurvey_${pid}`)
                return raw ? JSON.parse(raw) : {}
              } catch { return {} }
            })()}
            submitLabel="提交并完成实验"
            onSubmit={handleFinalSubmit}
          />
        )}
      </div>

      {showNextBtn && (
        <div style={{ padding: '12px 24px', borderTop: '1px solid #1e2430', background: '#0a0d14', textAlign: 'right' }}>
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
```

- [ ] **Step 2: Type check**

Run: `pnpm tsc --noEmit`
Expected: no new errors

- [ ] **Step 3: Commit**

```bash
git add src/pages/FlowPage.tsx
git commit -m "feat: add FlowPage with 6-step experiment runner and localStorage persistence"
```

---

### Task 7: Simplify `App.tsx` to setup/flow two states

**Files:**
- Modify: `src/App.tsx`

Replace the entire `App.tsx` with the two-state machine. Keep `DataStore`, `addLog`, `exportCSV` logic. Remove all page imports except SetupPage and FlowPage.

- [ ] **Step 1: Rewrite App.tsx**

Replace `src/App.tsx` with:

```tsx
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
```

- [ ] **Step 2: Type check**

Run: `pnpm tsc --noEmit`
Expected: no new errors from App.tsx

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: simplify App to setup/flow two-state machine"
```

---

### Task 8: Cleanup — delete old files and update types.ts

**Files:**
- Delete: `src/pages/ExperimenterConfigPage.tsx`
- Delete: `src/pages/PreSurveyPage.tsx`
- Delete: `src/pages/SurveyPage.tsx`
- Delete: `src/pages/TypingTestPage.tsx`
- Modify: `src/types.ts` (remove `AppPage` type)

- [ ] **Step 1: Delete obsolete pages**

```bash
rm src/pages/ExperimenterConfigPage.tsx
rm src/pages/PreSurveyPage.tsx
rm src/pages/SurveyPage.tsx
rm src/pages/TypingTestPage.tsx
```

- [ ] **Step 2: Remove AppPage from types.ts**

In `src/types.ts`, delete the `AppPage` type (lines 4–13):

```ts
// DELETE this block:
export type AppPage =
  | 'debug'
  | 'experimenter-config'
  | 'welcome'
  | 'typing-test'
  | 'tutorial'
  | 'pre-survey'
  | 'experiment'
  | 'survey'
```

- [ ] **Step 3: Type check**

Run: `pnpm tsc --noEmit`
Expected: no errors (if there are errors from deleted files being imported elsewhere, fix those imports too)

- [ ] **Step 4: Commit**

```bash
git add -u
git commit -m "chore: remove obsolete pages and AppPage type after restructure"
```

---

## Self-Review

**Spec coverage check:**
- ✅ SetupPage: StepNav + step preview + ID input + condition order + gaze config + "开始实验"
- ✅ FlowPage: 6 steps with StepNav, completedSteps tracking, lockedSteps during experiment
- ✅ Steps 0-3, 5 jumpable (can click back in StepNav)
- ✅ Step 4 locked (all StepNav buttons disabled during experiment)
- ✅ useStepCache: localStorage read on init + debounced 300ms write
- ✅ SurveyForm onChange + showSubmit
- ✅ localStorage keys: `flow_step_{id}`, `step_personal_{id}`, `step_presurvey_{id}`, `step_postsurvey_{id}`, `step_calibration_{id}`
- ✅ PERSONAL_SURVEY (step 1) and PANAS_PRE_SURVEY (step 2) split from PRE_SURVEY
- ✅ Calibration result saved to `step_calibration_{pid}` and session updated
- ✅ Final survey logs to IndexedDB via addLog
- ✅ After step 5: clear `flow_step_{pid}`, return to setup mode
- ✅ SetupPage shows completedSteps based on localStorage data for entered participantId
- ✅ App.tsx: two states only, no AppPage type dependency
- ✅ Old files deleted, AppPage type removed

**Potential issue**: `allComplete` in FlowPage imports `typeof PERSONAL_SURVEY` as the questions type parameter, but the function signature uses `typeof PERSONAL_SURVEY` which is `QuestionDef[]`. This works because `QuestionDef` is a union and the switch handles all cases. ✅

**Type consistency**: `SessionState.initialFlowStep` is added in both Task 5 (App.tsx interface) and used in Task 6 (FlowPage reads it). The Task 5 step modifies App.tsx before FlowPage imports SessionState, so the order is correct. ✅
