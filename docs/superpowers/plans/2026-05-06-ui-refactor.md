# UI 重构实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将实验系统重构为三区布局：顶部步骤导航、中间内容区、底部可折叠调试面板，移除左侧侧边栏和浮动调试面板。

**Architecture:** `FlowPage` 提升 `useInputSource`（设备连接）到顶层，拆分出 `useGazeHitTest`（键位命中检测）留在子页面；新建 `DebugDrawer` 固定在底部；`StepNav` 扩展支持实验条件副行。

**Tech Stack:** React 18, TypeScript, Vite, pnpm

---

## 文件变更清单

| 文件 | 操作 |
|------|------|
| `src/core/useInputSource.ts` | 新建 |
| `src/core/useGazeHitTest.ts` | 新建 |
| `src/components/DebugDrawer.tsx` | 新建 |
| `src/components/StepNav.tsx` | 修改（加 subSteps） |
| `src/components/FaceDebugPanel.tsx` | 修改（embedded 横排 + 删浮动模式） |
| `src/pages/FlowPage.tsx` | 大改 |
| `src/pages/TutorialPage.tsx` | 大改 |
| `src/pages/ExperimentPage.tsx` | 大改 |
| `src/core/useGazeInput.ts` | 删除 |

---

## Task 1: 新建 `useInputSource` hook

设备连接层：管理 `InputSource` 生命周期，输出原始 `gaze` 和 `faceEvent`，不感知控制器和键位。

**Files:**
- Create: `src/core/useInputSource.ts`

- [ ] **Step 1: 创建文件**

```ts
// src/core/useInputSource.ts
import { useState, useEffect, useRef, useCallback } from 'react'
import type { GazePoint, FaceEvent } from '../types'
import { InputSource, type GazeStatus } from './InputSource'

interface Config {
  gazeMode: 'tobii' | 'mouse'
  offsetX?: number
  offsetY?: number
  videoRef: { readonly current: HTMLVideoElement | null }
  cursorRef?: { readonly current: HTMLElement | null }
}

export function useInputSource({
  gazeMode,
  offsetX = 0,
  offsetY = 0,
  videoRef,
  cursorRef,
}: Config) {
  const [gaze, setGaze] = useState<GazePoint | null>(null)
  const [faceEvent, setFaceEvent] = useState<FaceEvent | null>(null)
  const [gazeStatus, setGazeStatus] = useState<GazeStatus>(
    gazeMode === 'mouse' ? 'ok' : 'connecting'
  )
  const srcRef = useRef<InputSource | null>(null)

  useEffect(() => {
    setGaze(null)
    setFaceEvent(null)
    setGazeStatus(gazeMode === 'mouse' ? 'ok' : 'connecting')

    const src = new InputSource(gazeMode)
    srcRef.current = src
    src.setOffset(offsetX, offsetY)
    if (cursorRef?.current) src.setCursorElement(cursorRef.current)
    src.onGazeStatus(setGazeStatus)

    const unsubFace = src.onFace(setFaceEvent)
    const unsubGaze = src.onGaze(g => {
      setGaze(g)
      if (gazeMode === 'tobii') setGazeStatus('ok')
    })

    src.connect(videoRef.current)

    return () => {
      unsubGaze()
      unsubFace()
      src.disconnect()
      src.setCursorElement(null)
      srcRef.current = null
    }
  }, [gazeMode]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    srcRef.current?.setOffset(offsetX, offsetY)
  }, [offsetX, offsetY])

  // Stable function wrapping srcRef, safe to pass as prop
  const toPixel = useCallback((g: GazePoint): { x: number; y: number } => {
    if (!srcRef.current) return { x: 0, y: 0 }
    return srcRef.current.toPixel(g, window.innerWidth, window.innerHeight)
  }, [])

  return { gaze, faceEvent, gazeStatus, toPixel }
}
```

- [ ] **Step 2: 类型检查**

```bash
pnpm tsc --noEmit
```

Expected: 无错误

- [ ] **Step 3: 提交**

```bash
git add src/core/useInputSource.ts
git commit -m "feat: add useInputSource hook (device connection layer)"
```

---

## Task 2: 新建 `useGazeHitTest` hook

键位命中检测层：接收 gaze/faceEvent，喂给控制器，执行 rect 命中检测。

**Files:**
- Create: `src/core/useGazeHitTest.ts`

- [ ] **Step 1: 创建文件**

```ts
// src/core/useGazeHitTest.ts
import { useRef, useEffect, useCallback } from 'react'
import type { GazePoint, FaceEvent } from '../types'
import type { InputController } from './InputController'

interface Config {
  gaze: GazePoint | null
  faceEvent: FaceEvent | null
  toPixel: (g: GazePoint) => { x: number; y: number }
  controllerRef: { readonly current: InputController | null }
}

export function useGazeHitTest({ gaze, faceEvent, toPixel, controllerRef }: Config) {
  const keyRects = useRef(new Map<string, DOMRect>())
  const prevHitKey = useRef<string | null>(null)

  // Feed face data to controller
  useEffect(() => {
    const ctrl = controllerRef.current
    if (ctrl && faceEvent) ctrl.feedFace(faceEvent)
  }, [faceEvent, controllerRef])

  // Feed gaze to controller + hit-test key rects
  useEffect(() => {
    if (!gaze) return
    const ctrl = controllerRef.current
    if (ctrl) {
      ctrl.setGaze(gaze)
      if (gaze.eyeOpen !== undefined) ctrl.feedEyeOpen(gaze.eyeOpen)
    }
    const px = toPixel(gaze)
    let hit: string | null = null
    keyRects.current.forEach((rect, rectKey) => {
      if (
        px.x >= rect.left && px.x <= rect.right &&
        px.y >= rect.top  && px.y <= rect.bottom
      ) hit = rectKey.split(':')[0]
    })
    if (ctrl && hit !== prevHitKey.current) {
      if (prevHitKey.current) ctrl.gazeLeaveKey(prevHitKey.current)
      if (hit) ctrl.gazeEnterKey(hit, gaze)
      prevHitKey.current = hit
    }
  }, [gaze, toPixel, controllerRef])

  const handleKeyRect = useCallback((key: string, rect: DOMRect) => {
    keyRects.current.set(key, rect)
  }, [])

  const resetHitTracking = useCallback(() => {
    prevHitKey.current = null
  }, [])

  return { handleKeyRect, resetHitTracking }
}
```

- [ ] **Step 2: 类型检查**

```bash
pnpm tsc --noEmit
```

Expected: 无错误

- [ ] **Step 3: 提交**

```bash
git add src/core/useGazeHitTest.ts
git commit -m "feat: add useGazeHitTest hook (hit-test + controller feeding)"
```

---

## Task 3: 新建 `DebugDrawer` + 更新 FaceDebugPanel embedded 布局

底部可折叠调试面板，嵌入 `FaceDebugPanel` embedded 模式。同步把 embedded 布局改为横排（摄像头在左，指标在右）。

**Files:**
- Create: `src/components/DebugDrawer.tsx`
- Modify: `src/components/FaceDebugPanel.tsx`

- [ ] **Step 1: 修改 FaceDebugPanel embedded 布局为横排**

在 `src/components/FaceDebugPanel.tsx` 找到 embedded 分支，替换：

```tsx
  if (embedded) {
    return (
      <div style={{ display: 'flex', flexDirection: 'row', gap: 12, padding: 8, alignItems: 'flex-start' }}>
        <canvas ref={canvasRef} width={cW} height={cH} style={{ borderRadius: 6, display: 'block', flexShrink: 0 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
          {metrics}
        </div>
      </div>
    )
  }
```

- [ ] **Step 2: 创建 DebugDrawer 组件**

```tsx
// src/components/DebugDrawer.tsx
import { useState } from 'react'
import { FaceDebugPanel } from './FaceDebugPanel'
import { loadJSON, saveJSON } from '../utils/storage'
import type { FaceEvent, GazePoint } from '../types'

const STORAGE_KEY = 'debug_drawer_open'

interface Props {
  videoRef: React.RefObject<HTMLVideoElement>
  faceEvent: FaceEvent | null
  gaze: GazePoint | null
}

export function DebugDrawer({ videoRef, faceEvent, gaze }: Props) {
  const [open, setOpen] = useState(() => loadJSON<boolean>(STORAGE_KEY, false))

  const smileScore = faceEvent?.smileScore ?? 0
  const leftOpen   = gaze?.leftOpen
  const rightOpen  = gaze?.rightOpen
  const eyesOpen   = leftOpen !== false && rightOpen !== false

  const toggle = () => {
    setOpen(v => { saveJSON(STORAGE_KEY, !v); return !v })
  }

  return (
    <div style={containerStyle}>
      <div style={barStyle} onClick={toggle}>
        <span style={{ fontSize: 11, color: '#555', userSelect: 'none' }}>🎥 调试面板</span>
        <span style={{ fontSize: 11, color: '#888', marginLeft: 12 }}>
          😊 {(smileScore * 100).toFixed(0)}%
        </span>
        {leftOpen !== undefined && (
          <span style={{
            fontSize: 11, marginLeft: 8,
            color: eyesOpen ? '#50fa7b' : '#ff6b6b',
          }}>
            👁 {eyesOpen ? 'open' : 'closed'}
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#444', userSelect: 'none' }}>
          {open ? '▼ 收起' : '▲ 展开'}
        </span>
      </div>
      {open && (
        <div style={{ borderTop: '1px solid #1e2430' }}>
          <FaceDebugPanel videoRef={videoRef} faceEvent={faceEvent} gaze={gaze} embedded />
        </div>
      )}
    </div>
  )
}

const containerStyle: React.CSSProperties = {
  flexShrink: 0,
  background: '#080b12',
  borderTop: '1px solid #1e2430',
}

const barStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center',
  padding: '0 16px', height: 36, cursor: 'pointer',
  gap: 4,
}
```

- [ ] **Step 3: 类型检查**

```bash
pnpm tsc --noEmit
```

Expected: 无错误

- [ ] **Step 4: 提交**

```bash
git add src/components/DebugDrawer.tsx src/components/FaceDebugPanel.tsx
git commit -m "feat: add DebugDrawer component and update FaceDebugPanel embedded layout"
```

---

## Task 4: 更新 StepNav 支持条件副行

**Files:**
- Modify: `src/components/StepNav.tsx`

- [ ] **Step 1: 更新 StepNav**

完整替换 `src/components/StepNav.tsx`：

```tsx
import type { CSSProperties } from 'react'

interface SubStep {
  label: string
  done: boolean
  active: boolean
}

interface Props {
  steps: { label: string }[]
  currentStep: number
  completedSteps: Set<number>
  lockedSteps?: Set<number>
  onStepClick: (index: number) => void
  subSteps?: SubStep[]
}

export function StepNav({
  steps, currentStep, completedSteps, lockedSteps = new Set(), onStepClick, subSteps,
}: Props) {
  return (
    <div style={{ background: '#0a0d14', borderBottom: '1px solid #1e2430', flexShrink: 0 }}>
      {/* Main steps row */}
      <div style={navBar}>
        {steps.map((s, i) => {
          const isCompleted = completedSteps.has(i)
          const isCurrent   = i === currentStep
          const isLocked    = lockedSteps.has(i)
          const canClick    = !isLocked
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

      {/* Condition sub-steps row (step 4 only) */}
      {subSteps && subSteps.length > 0 && (
        <div style={{ ...navBar, paddingTop: 4, paddingBottom: 8, borderTop: '1px solid #141820' }}>
          {subSteps.map((sub, i) => (
            <div
              key={i}
              style={{
                padding: '3px 10px', borderRadius: 4, fontSize: 11, whiteSpace: 'nowrap',
                background: sub.active ? '#1a2840' : 'transparent',
                color: sub.done ? '#50fa7b' : sub.active ? '#8be9fd' : '#3a4060',
                border: `1px solid ${sub.active ? '#2a5080' : 'transparent'}`,
              }}
            >
              {sub.done ? '✓ ' : sub.active ? '◉ ' : '○ '}
              {sub.label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const navBar: CSSProperties = {
  display: 'flex', gap: 4, padding: '8px 12px',
  overflowX: 'auto',
}

const stepBtn = (
  current: boolean, completed: boolean, locked: boolean, canClick: boolean,
): CSSProperties => ({
  padding: '6px 14px', borderRadius: 6, border: 'none',
  fontSize: 13, cursor: canClick ? 'pointer' : 'default', whiteSpace: 'nowrap',
  background: current ? '#5a7aff' : completed ? '#1a3a1a' : '#161c28',
  color: current ? '#fff' : completed ? '#50fa7b' : locked ? '#2a2a3a' : '#6a7490',
  opacity: locked ? 0.5 : 1,
  transition: 'background 150ms',
})
```

- [ ] **Step 2: 类型检查**

```bash
pnpm tsc --noEmit
```

Expected: 无错误

- [ ] **Step 3: 提交**

```bash
git add src/components/StepNav.tsx
git commit -m "feat: add subSteps prop to StepNav for condition progress row"
```

---

## Task 5: 重构 `FlowPage`

提升 `useInputSource`，添加 video+GazeCursor，管理 conditionIndex，集成 DebugDrawer 和 StepNav subSteps。

**Files:**
- Modify: `src/pages/FlowPage.tsx`

- [ ] **Step 1: 完整替换 FlowPage**

```tsx
// src/pages/FlowPage.tsx
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
}

const allComplete = (questions: typeof PERSONAL_SURVEY, answers: SurveyAnswers) =>
  questions.every(q => isComplete(q, answers[q.id]))

const saveStep = (pid: string, step: number) =>
  saveJSON(`flow_step_${pid}`, step)

export function FlowPage({ session, addLog, onSetSession, onDone }: Props) {
  const pid = session.participantId
  const [step, setStep] = useState(session.initialFlowStep)
  const [experimentConditionIndex, setExperimentConditionIndex] = useState(
    session.experimenterConfig.startConditionIndex
  )

  const videoRef  = useRef<HTMLVideoElement>(null)
  const cursorRef = useRef<HTMLDivElement>(null)

  const { gaze, faceEvent, toPixel } = useInputSource({
    gazeMode: session.gazeMode,
    offsetX:  session.gazeOffsetX ?? 0,
    offsetY:  session.gazeOffsetY ?? 0,
    videoRef,
    cursorRef,
  })

  // Condition order for subSteps display (read-only, no side effects)
  const conditionOrder = useRef(
    new ExperimentManager(pid, session.experimenterConfig).getConditionOrder()
  ).current

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

  const handleConditionChange = useCallback((index: number) => {
    setExperimentConditionIndex(index)
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

  // Build subSteps for StepNav when on experiment step
  const subSteps = step === 4 ? conditionOrder.map((cond, i) => ({
    label: `${cond.layout.toUpperCase()}/${METHOD_ZH[cond.inputMethod]}`,
    done:   i < experimentConditionIndex,
    active: i === experimentConditionIndex,
  })) : undefined

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Always-mounted video for camera stream */}
      <video ref={videoRef} style={{ display: 'none' }} />
      <GazeCursor ref={cursorRef} />

      <StepNav
        steps={STEPS}
        currentStep={step}
        completedSteps={completedSteps}
        onStepClick={handleStepClick}
        subSteps={subSteps}
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
            onConditionChange={handleConditionChange}
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

      <DebugDrawer videoRef={videoRef} faceEvent={faceEvent} gaze={gaze} />
    </div>
  )
}
```

- [ ] **Step 2: 类型检查（会因 TutorialPage/ExperimentPage props 未更新而报错，记录错误继续）**

```bash
pnpm tsc --noEmit 2>&1 | head -40
```

Expected: TutorialPage 和 ExperimentPage 会有 prop 类型报错，属正常，Task 6/7 解决。

- [ ] **Step 3: 提交**

```bash
git add src/pages/FlowPage.tsx
git commit -m "feat: refactor FlowPage with lifted useInputSource, DebugDrawer, condition subSteps"
```

---

## Task 6: 重构 `TutorialPage`

移除内部 `useGazeInput`、`<video>`、`<GazeCursor>`、`FaceDebugPanel`；接收 gaze/faceEvent/toPixel 作为 props；内部使用 `useGazeHitTest`。

**Files:**
- Modify: `src/pages/TutorialPage.tsx`

- [ ] **Step 1: 完整替换 TutorialPage**

```tsx
// src/pages/TutorialPage.tsx
import { useState, useEffect, useRef } from 'react'
import { useI18n } from '../i18n'
import { InputController } from '../core/InputController'
import { useGazeHitTest } from '../core/useGazeHitTest'
import { QwertyKeyboard, computeQwertyKeySize } from '../components/keyboards/QwertyKeyboard'
import type { InputMethod, FaceEvent, GazePoint } from '../types'
import { centerColumn } from '../styles'

interface Props {
  gaze: GazePoint | null
  faceEvent: FaceEvent | null
  toPixel: (g: GazePoint) => { x: number; y: number }
  onNext: (smileCalibPeak: number, smileThreshold: number) => void
}

type Step = 'smile-calib' | 'dwell-practice' | 'blink-practice' | 'smile-practice'

const PRACTICE_CHARS = ['e', 't', 'a']
const INSTRUCTION_KEY: Record<Step, string> = {
  'smile-calib':    'smileCalibInstruction',
  'dwell-practice': 'dwellInstruction',
  'blink-practice': 'blinkInstruction',
  'smile-practice': 'smileInstruction',
}
const STEP_METHOD: Partial<Record<Step, InputMethod>> = {
  'dwell-practice': 'dwell',
  'blink-practice': 'blink',
  'smile-practice': 'smile',
}

const btnStyle = (bg: string, enabled = true): React.CSSProperties => ({
  padding: '12px 32px', borderRadius: 8, border: 'none',
  background: enabled ? bg : '#333',
  color: enabled ? (bg === '#50fa7b' ? '#000' : '#fff') : '#666',
  fontSize: 16, cursor: enabled ? 'pointer' : 'not-allowed',
})

export function TutorialPage({ gaze, faceEvent, toPixel, onNext }: Props) {
  const { t } = useI18n()
  const [step, setStep] = useState<Step>('smile-calib')
  const [calibrating, setCalibrating] = useState(false)
  const [peakSmile, setPeakSmile] = useState(0)
  const [threshold, setThreshold] = useState(0)
  const [practiceIdx, setPracticeIdx] = useState(0)
  const [, forceUpdate] = useState(0)

  const faceRef         = useRef<FaceEvent | null>(null)
  const controllerRef   = useRef<InputController | null>(null)
  const thresholdRef    = useRef(0)
  const practiceIdxRef  = useRef(0)
  const stepRef         = useRef<Step>('smile-calib')
  const peakSmileRef    = useRef(0)

  faceRef.current        = faceEvent
  thresholdRef.current   = threshold
  practiceIdxRef.current = practiceIdx
  stepRef.current        = step
  peakSmileRef.current   = peakSmile

  const smileScore = faceEvent?.smileScore ?? 0

  const { handleKeyRect, resetHitTracking } = useGazeHitTest({
    gaze, faceEvent, toPixel, controllerRef,
  })

  useEffect(() => {
    const method = STEP_METHOD[step]
    if (!method) { controllerRef.current = null; return }
    resetHitTracking()
    const ctrl = new InputController(method, thresholdRef.current)
    controllerRef.current = ctrl

    const unsub = ctrl.onInput(() => {
      const idx         = practiceIdxRef.current
      const currentStep = stepRef.current
      if (idx < PRACTICE_CHARS.length - 1) {
        setPracticeIdx(i => i + 1)
      } else {
        setPracticeIdx(0)
        if (currentStep === 'dwell-practice')  setStep('blink-practice')
        else if (currentStep === 'blink-practice')  setStep('smile-practice')
        else if (currentStep === 'smile-practice')  onNext(peakSmileRef.current, thresholdRef.current)
      }
      forceUpdate(n => n + 1)
    })

    return unsub
  }, [step]) // eslint-disable-line react-hooks/exhaustive-deps

  const runCalibration = () => {
    setCalibrating(true)
    let peak = 0
    const interval = setInterval(() => {
      const s = faceRef.current?.smileScore ?? 0
      if (s > peak) peak = s
    }, 50)
    setTimeout(() => {
      clearInterval(interval)
      const th = peak * 0.8
      setPeakSmile(peak)
      setThreshold(th)
      setCalibrating(false)
    }, 3000)
  }

  const advancePractice = () => {
    if (practiceIdx < PRACTICE_CHARS.length - 1) { setPracticeIdx(i => i + 1); return }
    setPracticeIdx(0)
    if (step === 'dwell-practice')       setStep('blink-practice')
    else if (step === 'blink-practice')  setStep('smile-practice')
    else if (step === 'smile-practice')  onNext(peakSmile, threshold)
  }

  if (step === 'smile-calib') {
    return (
      <div style={centerColumn}>
        <h2>{t('tutorial.smileCalib')}</h2>
        <p style={{ color: '#888' }}>{t('tutorial.smileCalibInstruction')}</p>
        <div style={{ fontSize: 32, color: '#f1fa8c', fontVariantNumeric: 'tabular-nums' }}>
          {(smileScore * 100).toFixed(0)}%
        </div>
        {!calibrating && threshold === 0 && (
          <button onClick={runCalibration} style={btnStyle('#5a7aff')}>
            {t('tutorial.smileCalibStart')}
          </button>
        )}
        {calibrating && (
          <p style={{ color: '#888' }}>
            {'⬤ ⬤ ⬤'.split(' ').map((d, i) => (
              <span key={i} style={{ opacity: 0.4 + i * 0.3, marginRight: 4 }}>{d}</span>
            ))}
          </p>
        )}
        {threshold > 0 && !calibrating && (
          <>
            <p style={{ color: '#50fa7b' }}>
              {t('tutorial.smileCalibDone', { threshold: (threshold * 100).toFixed(0) + '%' })}
            </p>
            <button onClick={() => setStep('dwell-practice')} style={btnStyle('#50fa7b')}>
              {t('tutorial.beginExperiment')}
            </button>
          </>
        )}
      </div>
    )
  }

  const ctrl       = controllerRef.current
  const targetChar = PRACTICE_CHARS[practiceIdx]
  const kbAvailW   = window.innerWidth * 0.80 - 32
  const kbAvailH   = window.innerHeight * 0.60
  const keySize    = computeQwertyKeySize(kbAvailW, kbAvailH)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 20, gap: 16 }}>
      <h2 style={{ margin: 0 }}>{t('tutorial.title')}</h2>
      <p style={{ color: '#888', textAlign: 'center', maxWidth: 480, margin: 0 }}>
        {t(`tutorial.${INSTRUCTION_KEY[step]}`)}
      </p>

      <div style={{
        padding: '16px 40px', background: '#1a1a2e', borderRadius: 8,
        fontSize: 24, letterSpacing: 4, color: '#50fa7b', border: '2px solid #5a7aff',
      }}>
        {t('tutorial.practiceTarget', { char: targetChar.toUpperCase() })}
      </div>

      <p style={{ color: '#555', fontSize: 13, margin: 0 }}>
        {practiceIdx + 1} / {PRACTICE_CHARS.length}
      </p>

      {step === 'smile-practice' && ctrl && (
        <div style={{ fontSize: 13, color: '#f1fa8c' }}>
          😊 {(ctrl.getSmileScore() * 100).toFixed(0)}%
          {ctrl.getLockedKey() && (
            <span style={{ marginLeft: 12, color: '#f1fa8c' }}>🔒 {ctrl.getLockedKey()}</span>
          )}
        </div>
      )}

      {ctrl && (
        <QwertyKeyboard
          controller={ctrl} gaze={gaze} targetChar={targetChar}
          onKeyRect={handleKeyRect} keySize={keySize} showTarget
        />
      )}

      <button onClick={advancePractice} style={btnStyle('#444')}>
        {practiceIdx < PRACTICE_CHARS.length - 1 ? t('tutorial.practice') : t('tutorial.practiceComplete')}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: 类型检查**

```bash
pnpm tsc --noEmit
```

Expected: TutorialPage 相关错误消除；ExperimentPage 可能仍有错误。

- [ ] **Step 3: 提交**

```bash
git add src/pages/TutorialPage.tsx
git commit -m "refactor: TutorialPage receives gaze/faceEvent/toPixel as props, uses useGazeHitTest"
```

---

## Task 7: 重构 `ExperimentPage`

移除侧边栏、FaceDebugPanel、跳过按钮、GazeCursor、video；接收 gaze/faceEvent/toPixel 作为 props；使用 `useGazeHitTest`；加 `onConditionChange` 回调。

**Files:**
- Modify: `src/pages/ExperimentPage.tsx`

- [ ] **Step 1: 完整替换 ExperimentPage**

```tsx
// src/pages/ExperimentPage.tsx
import { useState, useEffect, useRef } from 'react'
import { useI18n } from '../i18n'
import type { SessionState } from '../App'
import { METHOD_ZH } from '../types'
import type { GazePoint, FaceEvent, EventLog } from '../types'
import { centerColumn } from '../styles'
import { InputController } from '../core/InputController'
import { useGazeHitTest } from '../core/useGazeHitTest'
import { ExperimentManager } from '../core/ExperimentManager'
import { QwertyKeyboard, computeQwertyKeySize } from '../components/keyboards/QwertyKeyboard'
import { OptiKeyboard, computeOptiKeySize } from '../components/keyboards/OptiKeyboard'
import { ConditionSurvey, type ConditionSurveyAnswers } from '../components/ConditionSurvey'

type ExperimentPhase = 'running' | 'condition-survey' | 'resting'

interface Props {
  session: SessionState
  gaze: GazePoint | null
  faceEvent: FaceEvent | null
  toPixel: (g: GazePoint) => { x: number; y: number }
  addLog: (log: EventLog) => void
  onNext: () => void
  onConditionChange: (index: number) => void
}

const REST_SECS = 60

export function ExperimentPage({
  session, gaze, faceEvent, toPixel, addLog: addLogProp, onNext, onConditionChange,
}: Props) {
  const { t } = useI18n()
  const [phase, setPhase] = useState<ExperimentPhase>('running')
  const [restSecsLeft, setRestSecsLeft] = useState(REST_SECS)
  const [conditionIndex, setConditionIndex] = useState(session.experimenterConfig.startConditionIndex)
  const [, forceUpdate] = useState(0)

  const managerRef      = useRef(new ExperimentManager(session.participantId, session.experimenterConfig))
  const controllerRef   = useRef<InputController | null>(null)

  const manager   = managerRef.current
  const ppc       = manager.getPhrasesPerCondition()
  const condition = manager.getConditionOrder()[conditionIndex]

  const { handleKeyRect, resetHitTracking } = useGazeHitTest({
    gaze, faceEvent, toPixel, controllerRef,
  })

  const addLog = (entry: Omit<EventLog, 'sessionId' | 'participantId'>) => {
    addLogProp({ ...entry, sessionId: session.sessionId, participantId: session.participantId })
  }

  // Notify parent when conditionIndex changes (for StepNav subSteps)
  useEffect(() => {
    onConditionChange(conditionIndex)
  }, [conditionIndex, onConditionChange])

  // Reinitialize controller when condition changes
  useEffect(() => {
    controllerRef.current = new InputController(condition.inputMethod, session.smileThreshold)
    const ctrl = controllerRef.current
    const isFirst = conditionIndex === session.experimenterConfig.startConditionIndex
    manager.startCondition(conditionIndex, isFirst ? session.experimenterConfig.startPhraseIndex : 0)
    resetHitTracking()

    const now = Date.now()
    addLog({ ts: now, type: 'experiment_start', description: `条件 ${conditionIndex + 1}: ${condition.layout.toUpperCase()} / ${condition.inputMethod}`, layout: condition.layout, isTutorial: false })
    addLog({ ts: now + 1, type: 'phrase_show', description: `短语 ${manager.getPhraseIndex() + 1}/${ppc}: "${manager.getCurrentPhrase()}"`, layout: condition.layout, isTutorial: false })

    const unsub = ctrl.onInput((fired) => {
      const now = fired.ts
      const inputChar = fired.key === 'SPACE' ? ' ' : fired.key.toLowerCase()
      const record = manager.recordInput(inputChar)

      addLog({
        ts: now,
        type: 'char_input',
        description: `"${fired.key}" → 目标"${record.targetChar}" ${record.isCorrect ? '✓' : '✗'}`,
        layout:          condition.layout,
        isTutorial:      false,
        gazeX:           fired.gazeX,
        gazeY:           fired.gazeY,
        smileScore:      fired.smileScore,
        mouthSmileLeft:  fired.mouthSmileLeft,
        mouthSmileRight: fired.mouthSmileRight,
        eyeSquintLeft:   fired.eyeSquintLeft,
        eyeSquintRight:  fired.eyeSquintRight,
        blinkDuration:   fired.blinkDuration,
        inputMethod:     condition.inputMethod,
        key:             fired.key,
        isCorrect:       record.isCorrect,
      })

      if (manager.isPhraseComplete()) {
        manager.nextPhrase()
        if (!manager.isConditionComplete()) {
          addLog({ ts: Date.now(), type: 'phrase_show', description: `短语 ${manager.getPhraseIndex() + 1}/${ppc}: "${manager.getCurrentPhrase()}"`, layout: condition.layout, isTutorial: false })
        }
      }

      forceUpdate(n => n + 1)

      if (manager.isConditionComplete()) {
        if (conditionIndex + 1 >= manager.getConditionOrder().length) {
          onNext()
        } else {
          setPhase('condition-survey')
        }
      }
    })

    return unsub
  }, [conditionIndex]) // eslint-disable-line react-hooks/exhaustive-deps

  // Rest timer
  useEffect(() => {
    if (phase !== 'resting') return
    const timer = setInterval(() => {
      setRestSecsLeft(s => {
        if (s <= 1) { clearInterval(timer); setPhase('running'); setConditionIndex(i => i + 1); return REST_SECS }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [phase])

  const handleSurveySubmit = (answers: ConditionSurveyAnswers) => {
    addLog({
      ts: Date.now(),
      type: 'condition_survey',
      description: `条件 ${conditionIndex + 1} 问卷: ${condition.layout} / ${condition.inputMethod}`,
      layout: condition.layout,
      inputMethod: condition.inputMethod,
      tlxMental:      answers.tlxMental,
      tlxPhysical:    answers.tlxPhysical,
      tlxTemporal:    answers.tlxTemporal,
      tlxPerformance: answers.tlxPerformance,
      tlxEffort:      answers.tlxEffort,
      tlxHappiness:   answers.tlxHappiness,
      fatigue:            answers.fatigue,
      smileNaturalness:   answers.smileNaturalness ?? undefined,
      smileEmbarrassment: answers.smileEmbarrassment ?? undefined,
    })
    setRestSecsLeft(REST_SECS)
    setPhase('resting')
  }

  const ctrl       = controllerRef.current
  const targetChar = manager.getTargetChar()
  const phrase     = manager.getCurrentPhrase()
  const charIndex  = manager.getCharIndex()

  const contentW  = window.innerWidth * 0.80
  const kbAvailW  = contentW - 32
  const kbAvailH  = (window.innerHeight - 200) * 0.78
  const keySize   = condition.layout === 'qwerty'
    ? computeQwertyKeySize(kbAvailW, kbAvailH)
    : computeOptiKeySize(kbAvailW, kbAvailH)

  if (phase === 'condition-survey') {
    return (
      <ConditionSurvey
        conditionIndex={conditionIndex}
        participantId={session.participantId}
        layout={condition.layout}
        inputMethod={condition.inputMethod}
        onSubmit={handleSurveySubmit}
      />
    )
  }

  if (phase === 'resting') {
    return (
      <div style={centerColumn}>
        <h2 style={{ color: '#f1fa8c' }}>{t('experiment.rest')}</h2>
        <p style={{ color: '#aaa', fontSize: 18 }}>
          {t('experiment.restMessage', { seconds: String(restSecsLeft) })}
        </p>
        <button
          onClick={() => { setPhase('running'); setConditionIndex(i => i + 1) }}
          style={actionBtn}
        >
          {t('experiment.restSkip')}
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 20, gap: 12 }}>
      {/* Condition label */}
      <span style={{ fontSize: 12, color: '#555', letterSpacing: 1 }}>
        {t('experiment.condition', { index: String(conditionIndex + 1) })}
        {' — '}
        {condition.layout.toUpperCase()} / {METHOD_ZH[condition.inputMethod]}
        {' — '}
        短语 {manager.getPhraseIndex() + 1}/{ppc}
      </span>

      {/* Phrase display */}
      <div style={{ fontSize: 20, letterSpacing: 3, fontFamily: 'monospace', padding: '10px 20px', background: '#111', borderRadius: 6 }}>
        {phrase.split('').map((ch, i) => (
          <span key={i} style={{
            color: i < charIndex ? '#50fa7b' : i === charIndex ? '#fff' : '#444',
            fontWeight: i === charIndex ? 'bold' : 'normal',
            textDecoration: i === charIndex ? 'underline' : 'none',
          }}>
            {ch === ' ' ? ' ' : ch}
          </span>
        ))}
      </div>

      {/* Smile score (smile input method only) */}
      {condition.inputMethod === 'smile' && ctrl && (
        <div style={{ fontSize: 13, color: '#f1fa8c' }}>
          😊 {(ctrl.getSmileScore() * 100).toFixed(0)}%
          {ctrl.getLockedKey() && (
            <span style={{ marginLeft: 12 }}>🔒 {ctrl.getLockedKey()}</span>
          )}
        </div>
      )}

      {/* Keyboard */}
      {ctrl && (
        condition.layout === 'qwerty'
          ? <QwertyKeyboard controller={ctrl} gaze={gaze} targetChar={targetChar} onKeyRect={handleKeyRect} keySize={keySize} />
          : <OptiKeyboard   controller={ctrl} gaze={gaze} targetChar={targetChar} onKeyRect={handleKeyRect} keySize={keySize} />
      )}
    </div>
  )
}

const actionBtn: React.CSSProperties = {
  padding: '12px 32px', borderRadius: 8, border: 'none',
  background: '#5a7aff', color: '#fff', fontSize: 16, cursor: 'pointer',
}
```

- [ ] **Step 2: 类型检查**

```bash
pnpm tsc --noEmit
```

Expected: 无错误

- [ ] **Step 3: 提交**

```bash
git add src/pages/ExperimentPage.tsx
git commit -m "refactor: ExperimentPage removes sidebar/debug/skip, uses useGazeHitTest"
```

---

## Task 8: 清理

删除 `useGazeInput.ts`（已被 Task 1/2 完整替代），移除 `FaceDebugPanel` 浮动模式。

**Files:**
- Delete: `src/core/useGazeInput.ts`
- Modify: `src/components/FaceDebugPanel.tsx`

- [ ] **Step 1: 删除 useGazeInput.ts**

```bash
git rm src/core/useGazeInput.ts
```

- [ ] **Step 2: 移除 FaceDebugPanel 浮动模式**

浮动模式包括：`pos` state、`dragRef`、`onHeaderMouseDown`、`collapsed` state、以及 `if (embedded) ... return (浮动JSX)` 之后的 return 块，连同 `floatingBase`、`headerStyle`、`collapseBtn` 常量。

保留：函数签名（去掉 `embedded` prop 判断，直接用横排布局）、`ScoreBar`、`eyeIndicator`、canvas 绘制 useEffect。

简化后的 Props 和 export function 头部：

```tsx
interface Props {
  videoRef: React.RefObject<HTMLVideoElement> | null
  faceEvent: FaceEvent | null
  gaze?: GazePoint | null
}

export function FaceDebugPanel({ videoRef, faceEvent, gaze }: Props) {
  const cW = 192
  const cH = 144
  // ... canvas ref, faceRef, useEffect (保持不变) ...

  return (
    <div style={{ display: 'flex', flexDirection: 'row', gap: 12, padding: 8, alignItems: 'flex-start' }}>
      <canvas ref={canvasRef} width={cW} height={cH} style={{ borderRadius: 6, display: 'block', flexShrink: 0 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
        {metrics}
      </div>
    </div>
  )
}
```

同步更新 `DebugPage.tsx` 和 `DebugDrawer.tsx` 中的 `FaceDebugPanel` 调用，去掉 `embedded` prop（现在只有一种模式）：

```tsx
// src/pages/DebugPage.tsx - 移除 embedded prop
<FaceDebugPanel videoRef={videoRef} faceEvent={faceEvent} gaze={gaze} />

// src/components/DebugDrawer.tsx - 移除 embedded prop
<FaceDebugPanel videoRef={videoRef} faceEvent={faceEvent} gaze={gaze} />
```

- [ ] **Step 3: 类型检查**

```bash
pnpm tsc --noEmit
```

Expected: 无错误

- [ ] **Step 4: 运行测试**

```bash
pnpm vitest run
```

Expected: 所有测试通过（测试只覆盖核心类，不涉及 hooks/组件）

- [ ] **Step 5: 提交**

```bash
git add src/components/FaceDebugPanel.tsx src/pages/DebugPage.tsx src/components/DebugDrawer.tsx
git commit -m "refactor: remove floating mode from FaceDebugPanel, delete useGazeInput"
```

---

## 验收检查

- [ ] `pnpm tsc --noEmit` 零错误
- [ ] `pnpm vitest run` 全部通过
- [ ] 页面打开：三区布局（顶部 StepNav、中间内容、底部 DebugDrawer 收起状态）
- [ ] 步骤4（实验）：StepNav 下方出现6个条件副行，随实验推进高亮
- [ ] DebugDrawer 展开/收起可切换，状态刷新后保留
- [ ] 实验键盘显示正常，注视高亮边框正常
- [ ] 无左侧侧边栏、无浮动 FaceDebugPanel
