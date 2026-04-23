# Experimenter Config Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated experimenter configuration page between debug and welcome where the experimenter sets participant ID, condition order (with Latin square recommendation), start position, and phrases per condition — firing a full config log entry on start.

**Architecture:** New `ExperimenterConfigPage` inserted into the existing `App.tsx` state machine. `ExperimenterConfig` type added to `types.ts`. `ExperimentManager` extended to accept the config override. `WelcomePage` simplified to language-only.

**Tech Stack:** React + TypeScript, Vitest for tests, existing `idb`-backed `DataStore`, `uuid` for session ID.

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/types.ts` | Add `ExperimenterConfig` interface; extend `EventLog` with 7 optional config fields |
| Modify | `src/App.tsx` | Add `'experimenter-config'` to `AppPage`; extend `SessionState`; wire new page |
| Modify | `src/core/ExperimentManager.ts` | Accept optional `ExperimenterConfig`; fix runtime `phrasesPerCondition`; extend `startCondition(index, phraseIndex?)` |
| Modify | `tests/core/ExperimentManager.test.ts` | Add tests for config override path and `startCondition` with phrase offset |
| Create | `src/pages/ExperimenterConfigPage.tsx` | Three-block config UI: basic info, condition table, action bar |
| Modify | `src/pages/WelcomePage.tsx` | Remove participant ID input; change `onNext(session)` → `onNext(language)` |
| Modify | `src/pages/ExperimentPage.tsx` | Use `session.experimenterConfig` in manager; respect start indices; add experimenter badge; replace hardcoded `15` |

---

### Task 1: Add `ExperimenterConfig` and extend `EventLog` in `types.ts`

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Add `ExperimenterConfig`, extend `AppPage`, and extend `EventLog`**

**a) Add `'experimenter-config'` to `AppPage` in `src/types.ts`:**

```ts
// Before:
export type AppPage =
  | 'debug'
  | 'welcome'
  | 'typing-test'
  | 'tutorial'
  | 'experiment'
  | 'survey'
  | 'export'

// After:
export type AppPage =
  | 'debug'
  | 'experimenter-config'
  | 'welcome'
  | 'typing-test'
  | 'tutorial'
  | 'experiment'
  | 'survey'
  | 'export'
```

**b) Add `ExperimenterConfig` interface before `EventLog` in `src/types.ts`:**

```ts
export interface ExperimenterConfig {
  experimenterName: string
  conditionOrder: ConditionConfig[]
  startConditionIndex: number   // 0-based
  startPhraseIndex: number      // 0-based
  phrasesPerCondition: number   // default 15
}
```

**c) Extend `EventLog` with these optional fields after `isCorrect?`:**

```ts
  // config snapshot — present on experiment_start config entry only:
  experimenterName?: string
  conditionOrder?: string       // JSON.stringify(ConditionConfig[])
  startConditionIndex?: number
  startPhraseIndex?: number
  phrasesPerCondition?: number
  gazeMode?: 'tobii' | 'mouse'
  language?: Language
```

- [ ] **Step 2: Run type check**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add ExperimenterConfig type and extend EventLog"
```

---

### Task 2: Extend `ExperimentManager` to accept config override

**Files:**
- Modify: `src/core/ExperimentManager.ts`
- Modify: `tests/core/ExperimentManager.test.ts`

- [ ] **Step 1: Write failing tests for new behavior**

Add to `tests/core/ExperimentManager.test.ts`:

```ts
import type { ExperimenterConfig } from '../../src/types'

describe('ExperimentManager — config override', () => {
  const mockConfig: ExperimenterConfig = {
    experimenterName: 'Tester',
    conditionOrder: [
      { layout: 'opti', inputMethod: 'blink' },
      { layout: 'opti', inputMethod: 'smile' },
      { layout: 'opti', inputMethod: 'dwell' },
      { layout: 'qwerty', inputMethod: 'blink' },
      { layout: 'qwerty', inputMethod: 'smile' },
      { layout: 'qwerty', inputMethod: 'dwell' },
    ],
    startConditionIndex: 0,
    startPhraseIndex: 0,
    phrasesPerCondition: 5,
  }

  it('uses conditionOrder from config instead of Latin square', () => {
    const mgr = new ExperimentManager('1', mockConfig)
    expect(mgr.getConditionOrder()[0]).toEqual({ layout: 'opti', inputMethod: 'blink' })
  })

  it('uses phrasesPerCondition from config', () => {
    const mgr = new ExperimentManager('1', mockConfig)
    expect(mgr.getPhrasesPerCondition()).toBe(5)
  })

  it('isConditionComplete uses runtime phrasesPerCondition', () => {
    const mgr = new ExperimentManager('1', mockConfig)
    mgr.startCondition(0)
    const phrase = mgr.getCurrentPhrase()
    for (const ch of phrase) mgr.recordInput(ch)
    mgr.nextPhrase()
    // After 1 phrase, not complete (phrasesPerCondition=5)
    expect(mgr.isConditionComplete()).toBe(false)
  })

  it('startCondition with phraseIndex skips to that phrase', () => {
    const mgr = new ExperimentManager('1', mockConfig)
    mgr.startCondition(0, 2)
    expect(mgr.getPhraseIndex()).toBe(2)
  })

  it('without config, falls back to Latin square (backward compat)', () => {
    const mgr = new ExperimentManager('1')
    expect(mgr.getConditionOrder()[0].layout).toBe('qwerty')
    expect(mgr.getPhrasesPerCondition()).toBe(15)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm vitest run tests/core/ExperimentManager.test.ts
```

Expected: new `config override` tests fail (method/property not yet defined).

- [ ] **Step 3: Update `ExperimentManager`**

Replace `src/core/ExperimentManager.ts` with:

```ts
import type { ConditionConfig, InputMethod, Layout, ExperimenterConfig } from '../types'
import { PHRASES_PER_CONDITION } from '../types'
import { PHRASES } from '../data/phrases'

const NUM_CONDITIONS = 6
const METHOD_ORDERS: InputMethod[][] = [
  ['smile', 'dwell', 'blink'],  // mod 0
  ['dwell', 'blink', 'smile'],  // mod 1
  ['blink', 'smile', 'dwell'],  // mod 2
]

export class ExperimentManager {
  private conditionOrder: ConditionConfig[]
  private conditionPhrases: string[][]
  private phrasesPerCondition: number
  private conditionIndex = 0
  private phraseIndex = 0
  private charIndex = 0

  constructor(private participantId: string, config?: ExperimenterConfig) {
    this.phrasesPerCondition = config?.phrasesPerCondition ?? PHRASES_PER_CONDITION
    this.conditionOrder = config?.conditionOrder ?? this.buildConditionOrder(participantId)
    this.conditionPhrases = this.buildConditionPhrases(participantId, this.phrasesPerCondition)
  }

  private buildConditionOrder(pid: string): ConditionConfig[] {
    const n = parseInt(pid, 10) || 1
    const firstLayout: Layout = n % 2 === 1 ? 'qwerty' : 'opti'
    const secondLayout: Layout = firstLayout === 'qwerty' ? 'opti' : 'qwerty'
    const methods = METHOD_ORDERS[n % 3]

    return [
      { layout: firstLayout,  inputMethod: methods[0] },
      { layout: firstLayout,  inputMethod: methods[1] },
      { layout: firstLayout,  inputMethod: methods[2] },
      { layout: secondLayout, inputMethod: methods[0] },
      { layout: secondLayout, inputMethod: methods[1] },
      { layout: secondLayout, inputMethod: methods[2] },
    ]
  }

  private buildConditionPhrases(pid: string, ppc: number): string[][] {
    const n = parseInt(pid, 10) || 1
    const totalNeeded = NUM_CONDITIONS * ppc
    const offset = (n * totalNeeded) % (PHRASES.length - totalNeeded)
    return Array.from({ length: NUM_CONDITIONS }, (_, i) =>
      PHRASES.slice(offset + i * ppc, offset + (i + 1) * ppc)
    )
  }

  getConditionOrder(): ConditionConfig[] {
    return this.conditionOrder
  }

  getPhrasesPerCondition(): number {
    return this.phrasesPerCondition
  }

  getCurrentCondition(): ConditionConfig {
    return this.conditionOrder[this.conditionIndex]
  }

  getConditionIndex(): number {
    return this.conditionIndex
  }

  startCondition(index: number, phraseIndex = 0) {
    this.conditionIndex = index
    this.phraseIndex = phraseIndex
    this.charIndex = 0
  }

  getCurrentPhrase(): string {
    return this.conditionPhrases[this.conditionIndex][this.phraseIndex]
  }

  getPhraseIndex(): number {
    return this.phraseIndex
  }

  getTargetChar(): string {
    const phrase = this.getCurrentPhrase()
    return phrase[this.charIndex] ?? ''
  }

  getCharIndex(): number {
    return this.charIndex
  }

  isPhraseComplete(): boolean {
    return this.charIndex >= this.getCurrentPhrase().length
  }

  isConditionComplete(): boolean {
    return this.phraseIndex >= this.phrasesPerCondition
  }

  isExperimentComplete(): boolean {
    return this.conditionIndex >= this.conditionOrder.length
  }

  recordInput(inputChar: string): { targetChar: string; inputChar: string; isCorrect: boolean } {
    const targetChar = this.getTargetChar()
    const isCorrect = inputChar === targetChar
    this.charIndex++
    return { targetChar, inputChar, isCorrect }
  }

  nextPhrase() {
    this.phraseIndex++
    this.charIndex = 0
  }

  advanceCondition() {
    this.conditionIndex++
    this.phraseIndex = 0
    this.charIndex = 0
  }
}
```

- [ ] **Step 4: Run all tests**

```bash
pnpm vitest run tests/core/ExperimentManager.test.ts
```

Expected: all tests pass (including pre-existing ones).

- [ ] **Step 5: Commit**

```bash
git add src/core/ExperimentManager.ts tests/core/ExperimentManager.test.ts
git commit -m "feat: ExperimentManager accepts ExperimenterConfig override"
```

---

### Task 3: Create `ExperimenterConfigPage`

**Files:**
- Create: `src/pages/ExperimenterConfigPage.tsx`

- [ ] **Step 1: Create the page**

Create `src/pages/ExperimenterConfigPage.tsx`:

```tsx
import { useState, useEffect } from 'react'
import { v4 as uuid } from 'uuid'
import type { ConditionConfig, EventLog, ExperimenterConfig } from '../types'
import { PHRASES_PER_CONDITION } from '../types'
import { ExperimentManager } from '../core/ExperimentManager'

interface Props {
  gazeMode: 'tobii' | 'mouse'
  addLog: (log: EventLog) => void
  onNext: (participantId: string, sessionId: string, config: ExperimenterConfig) => void
  onBack: () => void
}

const METHOD_COLOR: Record<string, string> = {
  dwell: '#4a90e2',
  blink: '#e2844a',
  smile: '#50fa7b',
}
const LAYOUT_COLOR: Record<string, string> = {
  qwerty: '#5a7aff',
  opti:   '#f1a740',
}
const METHOD_ZH: Record<string, string> = {
  dwell: '注视',
  blink: '眨眼',
  smile: '微笑',
}

export function ExperimenterConfigPage({ gazeMode, addLog, onNext, onBack }: Props) {
  const [experimenterName, setExperimenterName] = useState('')
  const [participantId, setParticipantId]       = useState('')
  const [ppc, setPpc]                           = useState(PHRASES_PER_CONDITION)
  const [conditions, setConditions]             = useState<ConditionConfig[]>([])
  const [startIdx, setStartIdx]                 = useState(0)   // 0-based condition
  const [startPhrase, setStartPhrase]           = useState(1)   // 1-based UI

  // Auto-populate once when participantId first becomes non-empty
  useEffect(() => {
    if (participantId && conditions.length === 0) {
      setConditions(new ExperimentManager(participantId).getConditionOrder())
    }
  }, [participantId, conditions.length])

  const applyLatinSquare = () => {
    if (!participantId) return
    setConditions(new ExperimentManager(participantId).getConditionOrder())
    setStartIdx(0)
    setStartPhrase(1)
  }

  const moveUp = (i: number) => {
    if (i === 0) return
    const next = [...conditions]
    ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
    setConditions(next)
    if (startIdx === i) setStartIdx(i - 1)
    else if (startIdx === i - 1) setStartIdx(i)
  }

  const moveDown = (i: number) => {
    if (i === conditions.length - 1) return
    const next = [...conditions]
    ;[next[i], next[i + 1]] = [next[i + 1], next[i]]
    setConditions(next)
    if (startIdx === i) setStartIdx(i + 1)
    else if (startIdx === i + 1) setStartIdx(i)
  }

  const canStart = experimenterName.trim() && participantId.trim() && conditions.length > 0

  const handleStart = () => {
    if (!canStart) return
    const sessionId = uuid()
    const config: ExperimenterConfig = {
      experimenterName: experimenterName.trim(),
      conditionOrder: conditions,
      startConditionIndex: startIdx,
      startPhraseIndex: startPhrase - 1,  // 0-based
      phrasesPerCondition: ppc,
    }
    const orderStr = conditions.map(c => `${c.layout}/${c.inputMethod}`).join(', ')
    addLog({
      sessionId,
      ts: Date.now(),
      type: 'experiment_start',
      description: `实验者:${config.experimenterName} P${participantId.trim()} 顺序:[${orderStr}] 起始:条件${startIdx + 1}语句${startPhrase} 每条件${ppc}句`,
      participantId: participantId.trim(),
      experimenterName: config.experimenterName,
      conditionOrder: JSON.stringify(conditions),
      startConditionIndex: startIdx,
      startPhraseIndex: config.startPhraseIndex,
      phrasesPerCondition: ppc,
      gazeMode,
    })
    onNext(participantId.trim(), sessionId, config)
  }

  return (
    <div style={pageStyle}>
      <h2 style={{ margin: '0 0 24px', fontSize: 22, color: '#cdd6f4' }}>实验配置</h2>

      {/* Block 1 — Basic info */}
      <div style={cardStyle}>
        <div style={rowStyle}>
          <label style={labelStyle}>实验者姓名</label>
          <input
            value={experimenterName}
            onChange={e => setExperimenterName(e.target.value)}
            placeholder="请输入姓名"
            style={inputStyle}
          />
          <label style={{ ...labelStyle, marginLeft: 32 }}>每条件语句数</label>
          <input
            type="number"
            min={1}
            max={30}
            value={ppc}
            onChange={e => setPpc(Math.max(1, Math.min(30, Number(e.target.value))))}
            style={{ ...inputStyle, width: 72 }}
          />
        </div>
        <div style={rowStyle}>
          <label style={labelStyle}>参与者 ID</label>
          <input
            value={participantId}
            onChange={e => setParticipantId(e.target.value)}
            placeholder="数字 ID"
            style={{ ...inputStyle, width: 120 }}
          />
          <button
            onClick={applyLatinSquare}
            disabled={!participantId}
            style={{
              ...btnStyle,
              marginLeft: 16,
              background: participantId ? '#1e2a4a' : '#1a1a2e',
              color: participantId ? '#8be9fd' : '#555',
              border: `1px solid ${participantId ? '#2a5080' : '#333'}`,
            }}
          >
            使用拉丁方推荐顺序
          </button>
        </div>
      </div>

      {/* Block 2 — Condition table */}
      {conditions.length > 0 && (
        <div style={cardStyle}>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 10 }}>
            条件顺序（可调整，点击行首设为起始条件）
          </div>
          {conditions.map((cond, i) => {
            const isStart = i === startIdx
            return (
              <div
                key={i}
                onClick={() => { setStartIdx(i); setStartPhrase(1) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 10px', borderRadius: 6, marginBottom: 4,
                  background: isStart ? '#0e1e3a' : '#0d1117',
                  border: `1px solid ${isStart ? '#2a5080' : '#1e2430'}`,
                  cursor: 'pointer',
                  transition: 'all 150ms',
                }}
              >
                {/* Start marker */}
                <span style={{ width: 14, color: '#5a7aff', fontSize: 13, flexShrink: 0 }}>
                  {isStart ? '▶' : ''}
                </span>

                {/* Up / Down */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <button onClick={e => { e.stopPropagation(); moveUp(i) }}
                    disabled={i === 0}
                    style={arrowBtn}>↑</button>
                  <button onClick={e => { e.stopPropagation(); moveDown(i) }}
                    disabled={i === conditions.length - 1}
                    style={arrowBtn}>↓</button>
                </div>

                {/* Condition number */}
                <span style={{ width: 36, fontSize: 12, color: '#666' }}>#{i + 1}</span>

                {/* Layout badge */}
                <span style={{
                  padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600,
                  background: LAYOUT_COLOR[cond.layout] + '22',
                  color: LAYOUT_COLOR[cond.layout],
                  border: `1px solid ${LAYOUT_COLOR[cond.layout]}44`,
                  width: 64, textAlign: 'center',
                }}>
                  {cond.layout.toUpperCase()}
                </span>

                {/* Method badge */}
                <span style={{
                  padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600,
                  background: METHOD_COLOR[cond.inputMethod] + '22',
                  color: METHOD_COLOR[cond.inputMethod],
                  border: `1px solid ${METHOD_COLOR[cond.inputMethod]}44`,
                  width: 56, textAlign: 'center',
                }}>
                  {METHOD_ZH[cond.inputMethod]}
                </span>

                {/* Start phrase input (only on start row) */}
                {isStart && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 8 }}
                    onClick={e => e.stopPropagation()}>
                    <span style={{ fontSize: 12, color: '#8be9fd' }}>起始语句</span>
                    <input
                      type="number"
                      min={1}
                      max={ppc}
                      value={startPhrase}
                      onChange={e => setStartPhrase(Math.max(1, Math.min(ppc, Number(e.target.value))))}
                      style={{ ...inputStyle, width: 60, padding: '4px 8px' }}
                    />
                    <span style={{ fontSize: 12, color: '#555' }}>/ {ppc}</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {conditions.length === 0 && participantId && (
        <div style={{ color: '#555', fontSize: 13, margin: '8px 0' }}>
          输入参与者 ID 后点击"使用拉丁方推荐顺序"生成条件
        </div>
      )}

      {/* Block 3 — Action bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24, width: '100%', maxWidth: 680 }}>
        <button onClick={onBack} style={{ ...btnStyle, color: '#666', background: 'transparent', border: '1px solid #333' }}>
          ← 返回调试
        </button>
        <button
          onClick={handleStart}
          disabled={!canStart}
          style={{
            ...btnStyle,
            background: canStart ? '#5a7aff' : '#1e1e2e',
            color: canStart ? '#fff' : '#444',
            border: 'none',
            padding: '12px 40px',
            fontSize: 16,
          }}
        >
          开始实验 →
        </button>
      </div>
    </div>
  )
}

const pageStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center',
  minHeight: '100vh', padding: '40px 24px', gap: 16,
}
const cardStyle: React.CSSProperties = {
  width: '100%', maxWidth: 680, background: '#0d1117',
  border: '1px solid #1e2430', borderRadius: 8, padding: '16px 20px',
  display: 'flex', flexDirection: 'column', gap: 12,
}
const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
}
const labelStyle: React.CSSProperties = {
  fontSize: 13, color: '#888', width: 80, flexShrink: 0,
}
const inputStyle: React.CSSProperties = {
  padding: '8px 12px', borderRadius: 6,
  border: '1px solid #2a3040', background: '#0a0d12',
  color: '#cdd6f4', fontSize: 14, outline: 'none', width: 200,
}
const btnStyle: React.CSSProperties = {
  padding: '8px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 13,
}
const arrowBtn: React.CSSProperties = {
  padding: '0 4px', lineHeight: '14px', fontSize: 11,
  background: 'transparent', border: '1px solid #2a3040',
  color: '#666', cursor: 'pointer', borderRadius: 3,
}
```

- [ ] **Step 2: Run type check**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/ExperimenterConfigPage.tsx
git commit -m "feat: add ExperimenterConfigPage"
```

---

### Task 4: Wire `App.tsx`

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Update `App.tsx`**

Replace the entire `src/App.tsx` with:

```tsx
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
import { ExportPage } from './pages/ExportPage'

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

  return (
    <I18nProvider>
      <div style={{ minHeight: '100vh', background: '#0d1117', color: '#cdd6f4', fontFamily: 'system-ui, sans-serif' }}>
        {page === 'debug' && (
          <DebugPage
            displayLogs={displayLogs}
            addLog={addLog}
            clearLogs={clearLogs}
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
              goTo('experiment')
            }}
          />
        )}
        {page === 'experiment' && session && (
          <ExperimentPage session={session} addLog={addLog} onNext={() => goTo('survey')} />
        )}
        {page === 'survey' && (
          <SurveyPage onNext={() => goTo('export')} />
        )}
        {page === 'export' && (
          <ExportPage />
        )}
      </div>
    </I18nProvider>
  )
}
```

- [ ] **Step 2: Run type check**

```bash
pnpm tsc --noEmit
```

Expected: errors in `WelcomePage` (wrong `onNext` signature) and `ExperimentPage` (missing `experimenterConfig` usage). These are fixed in the next tasks.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: wire ExperimenterConfigPage into App state machine"
```

---

### Task 5: Simplify `WelcomePage`

**Files:**
- Modify: `src/pages/WelcomePage.tsx`

- [ ] **Step 1: Update `WelcomePage`**

Replace `src/pages/WelcomePage.tsx` with:

```tsx
import { useI18n } from '../i18n'
import type { Language } from '../types'

interface Props {
  onNext: (language: Language) => void
}

export function WelcomePage({ onNext }: Props) {
  const { t, lang, setLang } = useI18n()

  return (
    <div style={centerStyle}>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>{t('welcome.title')}</h1>

      <div style={{ display: 'flex', gap: 10 }}>
        {(['zh', 'ja', 'en'] as Language[]).map(l => (
          <button
            key={l}
            onClick={() => setLang(l)}
            style={{
              padding: '8px 20px',
              borderRadius: 6,
              border: `2px solid ${lang === l ? '#5a7aff' : '#333'}`,
              background: lang === l ? '#1e1e4e' : '#1a1a2e',
              color: lang === l ? '#fff' : '#888',
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            {l === 'zh' ? '中文' : l === 'ja' ? '日本語' : 'English'}
          </button>
        ))}
      </div>

      <button
        onClick={() => onNext(lang)}
        style={{
          padding: '12px 40px',
          borderRadius: 8,
          border: 'none',
          background: '#5a7aff',
          color: '#fff',
          fontSize: 16,
          cursor: 'pointer',
        }}
      >
        {t('welcome.start')}
      </button>
    </div>
  )
}

const centerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '100vh',
  gap: 20,
}
```

- [ ] **Step 2: Run type check**

```bash
pnpm tsc --noEmit
```

Expected: only `ExperimentPage` errors remain.

- [ ] **Step 3: Commit**

```bash
git add src/pages/WelcomePage.tsx
git commit -m "feat: simplify WelcomePage — remove participant ID, language-only onNext"
```

---

### Task 6: Update `ExperimentPage` — use config, add badge, fix hardcoded `15`s

**Files:**
- Modify: `src/pages/ExperimentPage.tsx`

- [ ] **Step 1: Update `ExperimentPage`**

Apply these targeted changes to `src/pages/ExperimentPage.tsx`:

**a) Initialize manager with experimenterConfig (line 31):**
```tsx
// Before:
const managerRef = useRef(new ExperimentManager(session.participantId))
// After:
const managerRef = useRef(new ExperimentManager(session.participantId, session.experimenterConfig))
```

**b) Initialize conditionIndex from config (line 28):**
```tsx
// Before:
const [conditionIndex, setConditionIndex] = useState(0)
// After:
const [conditionIndex, setConditionIndex] = useState(session.experimenterConfig.startConditionIndex)
```

**c) In the condition-change `useEffect`, pass phraseIndex to startCondition (line 56):**
```tsx
// Before:
manager.startCondition(conditionIndex)
// After:
const isFirst = conditionIndex === session.experimenterConfig.startConditionIndex
manager.startCondition(conditionIndex, isFirst ? session.experimenterConfig.startPhraseIndex : 0)
```

**d) Replace hardcoded `15` with `manager.getPhrasesPerCondition()`. Add a local `ppc` variable after `const manager = managerRef.current` (around line 36):**
```tsx
const manager = managerRef.current
const ppc = manager.getPhrasesPerCondition()
```

**e) Replace all hardcoded `15` occurrences:**

In the `useEffect` (phrase_show log at condition start):
```tsx
// Before:
description: `短语 1/15: "${manager.getCurrentPhrase()}"`
// After:
description: `短语 ${manager.getPhraseIndex() + 1}/${ppc}: "${manager.getCurrentPhrase()}"`
```

In `ctrl.onInput` callback (phrase_show after phrase complete):
```tsx
// Before:
description: `短语 ${manager.getPhraseIndex() + 1}/15: "${manager.getCurrentPhrase()}"`
// After:
description: `短语 ${manager.getPhraseIndex() + 1}/${ppc}: "${manager.getCurrentPhrase()}"`
```

In `skipPhrase` (phrase_show after skip):
```tsx
// Before:
description: `[跳过] 短语 ${manager.getPhraseIndex() + 1}/15: "${manager.getCurrentPhrase()}"`
// After:
description: `[跳过] 短语 ${manager.getPhraseIndex() + 1}/${ppc}: "${manager.getCurrentPhrase()}"`
```

In sidebar condition header (phrase counter):
```tsx
// Before:
{manager.getPhraseIndex() + 1} / 15
// After:
{manager.getPhraseIndex() + 1} / {ppc}
```

In sidebar progress bar width:
```tsx
// Before:
width: `${(manager.getPhraseIndex() / 15) * 100}%`
// After:
width: `${(manager.getPhraseIndex() / ppc) * 100}%`
```

In main content condition info line:
```tsx
// Before:
短语 {manager.getPhraseIndex() + 1}/15
// After:
短语 {manager.getPhraseIndex() + 1}/{ppc}
```

**f) Add experimenter badge** — add this block just inside the main content `<div>` (after `{sidebar}`, before the `{/* Main content */}` div):

```tsx
{/* Experimenter badge */}
<div style={{
  position: 'fixed', top: 8, right: 12, zIndex: 200,
  display: 'flex', gap: 8, alignItems: 'center',
  fontSize: 11, color: '#555',
}}>
  <span>实验者: {session.experimenterName}</span>
  <span style={{ color: '#333' }}>|</span>
  <span>P{session.participantId}</span>
  <span style={{ color: '#333' }}>|</span>
  <span>条件 {conditionIndex + 1}/6</span>
</div>
```

- [ ] **Step 2: Run type check**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run all tests**

```bash
pnpm vitest run
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/pages/ExperimentPage.tsx
git commit -m "feat: ExperimentPage uses experimenterConfig, adds badge, fixes hardcoded phrase counts"
```

---

### Task 7: Smoke test in browser

- [ ] **Step 1: Start dev server**

```bash
pnpm dev --host
```

- [ ] **Step 2: Walk through the full flow**

1. Open browser → lands on debug page → click "开始" 
2. `ExperimenterConfigPage` appears — verify three blocks render correctly
3. Enter experimenter name → enter participant ID → conditions auto-populate
4. Click "使用拉丁方推荐顺序" → verify order resets
5. Click ↑/↓ to reorder a condition → verify order changes, ▶ marker tracks correctly
6. Click a different row → verify ▶ moves to it, start-phrase input appears
7. Change 每条件语句数 to `5` → verify start-phrase input clamps to ≤5
8. Click "开始实验 →" → goes to `WelcomePage` (language selector only, no ID field)
9. Click start → `TypingTestPage` → `TutorialPage` → `ExperimentPage`
10. In `ExperimentPage`: verify badge shows experimenter name, P-ID, condition number
11. Verify phrase counter shows `/5` (not `/15`) when phrasesPerCondition was set to 5
12. Check debug panel in browser console — first log entry should be the config `experiment_start` event with all fields

- [ ] **Step 3: Final commit if any polish fixes were made**

```bash
git add -p
git commit -m "fix: experimenter config page polish"
```
