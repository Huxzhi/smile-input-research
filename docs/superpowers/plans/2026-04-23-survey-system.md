# Survey System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-condition NASA-TLX survey (triggered after each condition, before rest) and extend the final survey with preference ranking and demographics — all saved to IndexedDB.

**Architecture:** Per-condition survey is a new `'condition-survey'` phase inside `ExperimentPage` (replacing the `resting: boolean` with a `phase` union). Final `SurveyPage` gains two new steps (preference + demographics) and saves a `final_survey` log. All data flows through the existing `addLog` → `DataStore.saveLog` pipeline.

**Tech Stack:** React + TypeScript, `useI18n` hook, existing `EventLog` / `DataStore` infrastructure.

---

## File Map

| File | Change |
|------|--------|
| `src/types.ts` | Add 2 EventLogType values + 13 optional EventLog fields |
| `src/i18n/zh.json` | Add `conditionSurvey.*` and `finalSurvey.*` keys |
| `src/i18n/en.json` | Same |
| `src/i18n/ja.json` | Same |
| `src/components/ConditionSurvey.tsx` | New — NASA-TLX + smile questions |
| `src/pages/ExperimentPage.tsx` | Replace `resting` bool with `phase` union; render `ConditionSurvey` |
| `src/pages/SurveyPage.tsx` | Add preference + demographics steps; save `final_survey` log |
| `src/App.tsx` | Pass `sessionId`, `participantId`, `addLog` to `SurveyPage` |

---

## Task 1: Extend data model in `types.ts`

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Add new EventLogType values and EventLog fields**

Replace lines 71–102 in `src/types.ts` with:

```ts
export type EventLogType =
  | 'experiment_start'
  | 'phrase_show'
  | 'char_input'
  | 'condition_survey'
  | 'final_survey'

export interface EventLog {
  sessionId: string
  ts: number
  type: EventLogType
  description: string
  // context — present on every entry
  participantId?: string
  layout?: Layout
  isTutorial?: boolean
  // char_input only:
  gazeX?: number
  gazeY?: number
  smileScore?: number
  mouthSmileLeft?: number
  mouthSmileRight?: number
  eyeSquintLeft?: number
  eyeSquintRight?: number
  blinkDuration?: number | null
  inputMethod?: InputMethod
  key?: string
  isCorrect?: boolean
  // config snapshot — present on experiment_start config entry only:
  experimenterName?: string
  conditionOrder?: string
  startConditionIndex?: number
  startPhraseIndex?: number
  phrasesPerCondition?: number
  gazeMode?: 'tobii' | 'mouse'
  language?: Language
  // condition_survey (NASA-TLX, 1–7 each):
  tlxMental?: number
  tlxPhysical?: number
  tlxTemporal?: number
  tlxPerformance?: number
  tlxEffort?: number
  tlxHappiness?: number
  // condition_survey smile-specific (1–5, only when inputMethod === 'smile'):
  smileNaturalness?: number
  smileEmbarrassment?: number
  // final_survey:
  panasAnswers?: string    // JSON.stringify(number[20]), values 1–5
  preferenceRank?: string  // JSON.stringify(InputMethod[3]), best→worst
  age?: number
  gender?: string          // 'male' | 'female' | 'other' | 'prefer_not'
  hasEyeCondition?: boolean
}
```

- [ ] **Step 2: Verify types compile**

```bash
pnpm tsc --noEmit
```

Expected: no output (no errors).

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: extend EventLog with condition_survey and final_survey types"
```

---

## Task 2: Add i18n keys

**Files:**
- Modify: `src/i18n/zh.json`
- Modify: `src/i18n/en.json`
- Modify: `src/i18n/ja.json`

- [ ] **Step 1: Add keys to `src/i18n/zh.json`**

Add before the closing `}` of the root object (after the `"panas"` block):

```json
,
"conditionSurvey": {
  "title": "本轮完成——请评价一下",
  "subtitle": "条件 {index}：{layout} / {method}",
  "submit": "提交并休息",
  "tlx": {
    "mental":      { "label": "脑力需求",    "lo": "极低",   "hi": "极高" },
    "physical":    { "label": "体力需求",    "lo": "极低",   "hi": "极高" },
    "temporal":    { "label": "时间压力",    "lo": "极低",   "hi": "极高" },
    "performance": { "label": "表现满意度",  "lo": "非常满意", "hi": "非常不满意" },
    "effort":      { "label": "努力程度",    "lo": "极低",   "hi": "极高" },
    "happiness":   { "label": "愉悦感",      "lo": "极低",   "hi": "极高" }
  },
  "smileNaturalness":   "用微笑选字让我感到不自然",
  "smileEmbarrassment": "如果在公开场合使用，我会感到尴尬",
  "smileScale": ["完全不同意", "不同意", "中立", "同意", "完全同意"]
},
"finalSurvey": {
  "next": "下一步",
  "preferenceTitle": "输入方式偏好排序",
  "preferenceInstruction": "请将三种输入方式从最喜欢（上）到最不喜欢（下）排序",
  "methodNames": { "dwell": "注视输入", "blink": "眨眼输入", "smile": "微笑输入" },
  "demographicsTitle": "基本信息",
  "age": "年龄",
  "gender": "性别",
  "genderOptions": { "male": "男", "female": "女", "other": "其他", "prefer_not": "不愿透露" },
  "hasEyeCondition": "您是否有眼部或面部肌肉疾病？",
  "yes": "是",
  "no": "否",
  "submit": "提交"
}
```

- [ ] **Step 2: Add keys to `src/i18n/en.json`**

Add before the closing `}` of the root object:

```json
,
"conditionSurvey": {
  "title": "Round complete — please rate it",
  "subtitle": "Condition {index}: {layout} / {method}",
  "submit": "Submit and rest",
  "tlx": {
    "mental":      { "label": "Mental demand",        "lo": "Very low",  "hi": "Very high" },
    "physical":    { "label": "Physical demand",      "lo": "Very low",  "hi": "Very high" },
    "temporal":    { "label": "Time pressure",        "lo": "Very low",  "hi": "Very high" },
    "performance": { "label": "Performance",          "lo": "Very good", "hi": "Very poor" },
    "effort":      { "label": "Effort",               "lo": "Very low",  "hi": "Very high" },
    "happiness":   { "label": "Happiness",            "lo": "Very low",  "hi": "Very high" }
  },
  "smileNaturalness":   "Using smile to select felt unnatural",
  "smileEmbarrassment": "I would feel embarrassed using this in public",
  "smileScale": ["Strongly disagree", "Disagree", "Neutral", "Agree", "Strongly agree"]
},
"finalSurvey": {
  "next": "Next",
  "preferenceTitle": "Input method preference",
  "preferenceInstruction": "Rank from most preferred (top) to least preferred (bottom)",
  "methodNames": { "dwell": "Dwell", "blink": "Blink", "smile": "Smile" },
  "demographicsTitle": "Demographics",
  "age": "Age",
  "gender": "Gender",
  "genderOptions": { "male": "Male", "female": "Female", "other": "Other", "prefer_not": "Prefer not to say" },
  "hasEyeCondition": "Do you have any eye or facial muscle condition?",
  "yes": "Yes",
  "no": "No",
  "submit": "Submit"
}
```

- [ ] **Step 3: Add keys to `src/i18n/ja.json`**

Add before the closing `}` of the root object:

```json
,
"conditionSurvey": {
  "title": "このラウンドの評価",
  "subtitle": "条件 {index}：{layout} / {method}",
  "submit": "送信して休憩",
  "tlx": {
    "mental":      { "label": "精神的負荷",       "lo": "非常に低い", "hi": "非常に高い" },
    "physical":    { "label": "身体的負荷",       "lo": "非常に低い", "hi": "非常に高い" },
    "temporal":    { "label": "時間的プレッシャー", "lo": "非常に低い", "hi": "非常に高い" },
    "performance": { "label": "パフォーマンス満足度", "lo": "非常に良い", "hi": "非常に悪い" },
    "effort":      { "label": "努力",             "lo": "非常に低い", "hi": "非常に高い" },
    "happiness":   { "label": "楽しさ",           "lo": "非常に低い", "hi": "非常に高い" }
  },
  "smileNaturalness":   "笑顔で文字を選択するのは不自然に感じた",
  "smileEmbarrassment": "公共の場でこの方法を使うと恥ずかしい",
  "smileScale": ["全くそう思わない", "そう思わない", "どちらでもない", "そう思う", "非常にそう思う"]
},
"finalSurvey": {
  "next": "次へ",
  "preferenceTitle": "入力方法の好みランキング",
  "preferenceInstruction": "最も好き（上）から最も嫌い（下）に順位付けしてください",
  "methodNames": { "dwell": "注視入力", "blink": "まばたき入力", "smile": "笑顔入力" },
  "demographicsTitle": "基本情報",
  "age": "年齢",
  "gender": "性別",
  "genderOptions": { "male": "男性", "female": "女性", "other": "その他", "prefer_not": "答えたくない" },
  "hasEyeCondition": "目や顔の筋肉に疾患はありますか？",
  "yes": "はい",
  "no": "いいえ",
  "submit": "送信"
}
```

- [ ] **Step 4: Verify types compile**

```bash
pnpm tsc --noEmit
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add src/i18n/zh.json src/i18n/en.json src/i18n/ja.json
git commit -m "feat: add conditionSurvey and finalSurvey i18n keys"
```

---

## Task 3: Create `ConditionSurvey` component

**Files:**
- Create: `src/components/ConditionSurvey.tsx`

- [ ] **Step 1: Create the file with full content**

```tsx
import { useState } from 'react'
import { useI18n } from '../i18n'
import type { Layout, InputMethod } from '../types'

export interface ConditionSurveyAnswers {
  tlxMental: number
  tlxPhysical: number
  tlxTemporal: number
  tlxPerformance: number
  tlxEffort: number
  tlxHappiness: number
  smileNaturalness: number | null
  smileEmbarrassment: number | null
}

interface Props {
  conditionIndex: number
  layout: Layout
  inputMethod: InputMethod
  onSubmit: (answers: ConditionSurveyAnswers) => void
}

const TLX_KEYS = ['mental', 'physical', 'temporal', 'performance', 'effort', 'happiness'] as const
type TLXKey = typeof TLX_KEYS[number]

const METHOD_ZH: Record<InputMethod, string> = { dwell: '注视', blink: '眨眼', smile: '微笑' }

export function ConditionSurvey({ conditionIndex, layout, inputMethod, onSubmit }: Props) {
  const { t } = useI18n()
  const [tlx, setTlx] = useState<Record<TLXKey, number>>({
    mental: 0, physical: 0, temporal: 0, performance: 0, effort: 0, happiness: 0,
  })
  const [smileNat, setSmileNat] = useState(0)
  const [smileEmb, setSmileEmb] = useState(0)

  const isSmile = inputMethod === 'smile'
  const tlxDone = TLX_KEYS.every(k => tlx[k] > 0)
  const smileDone = !isSmile || (smileNat > 0 && smileEmb > 0)
  const canSubmit = tlxDone && smileDone

  const handleSubmit = () => {
    if (!canSubmit) return
    onSubmit({
      tlxMental:     tlx.mental,
      tlxPhysical:   tlx.physical,
      tlxTemporal:   tlx.temporal,
      tlxPerformance: tlx.performance,
      tlxEffort:     tlx.effort,
      tlxHappiness:  tlx.happiness,
      smileNaturalness:   isSmile ? smileNat : null,
      smileEmbarrassment: isSmile ? smileEmb : null,
    })
  }

  const smileScaleLo = t('conditionSurvey.smileScale.0')
  const smileScaleHi = t('conditionSurvey.smileScale.4')

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '32px 16px' }}>
      <h2 style={{ marginBottom: 4 }}>{t('conditionSurvey.title')}</h2>
      <p style={{ color: '#888', marginBottom: 24, fontSize: 13 }}>
        {t('conditionSurvey.subtitle', {
          index: String(conditionIndex + 1),
          layout: layout.toUpperCase(),
          method: METHOD_ZH[inputMethod],
        })}
      </p>

      {TLX_KEYS.map(key => (
        <ScaleRow
          key={key}
          label={t(`conditionSurvey.tlx.${key}.label`)}
          lo={t(`conditionSurvey.tlx.${key}.lo`)}
          hi={t(`conditionSurvey.tlx.${key}.hi`)}
          points={7}
          value={tlx[key]}
          onChange={v => setTlx(prev => ({ ...prev, [key]: v }))}
        />
      ))}

      {isSmile && (
        <>
          <p style={{ color: '#f1fa8c', marginTop: 20, marginBottom: 4, fontSize: 13 }}>微笑输入专项</p>
          <ScaleRow
            label={t('conditionSurvey.smileNaturalness')}
            lo={smileScaleLo}
            hi={smileScaleHi}
            points={5}
            value={smileNat}
            onChange={setSmileNat}
          />
          <ScaleRow
            label={t('conditionSurvey.smileEmbarrassment')}
            lo={smileScaleLo}
            hi={smileScaleHi}
            points={5}
            value={smileEmb}
            onChange={setSmileEmb}
          />
        </>
      )}

      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        style={{
          marginTop: 28, padding: '12px 32px', borderRadius: 8, border: 'none',
          background: canSubmit ? '#50fa7b' : '#333',
          color: canSubmit ? '#000' : '#666',
          fontSize: 16, cursor: canSubmit ? 'pointer' : 'not-allowed', width: '100%',
        }}
      >
        {t('conditionSurvey.submit')}
      </button>
    </div>
  )
}

function ScaleRow({ label, lo, hi, points, value, onChange }: {
  label: string
  lo: string
  hi: string
  points: number
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 0', borderBottom: '1px solid #1e1e3e' }}>
      <span style={{ fontSize: 14, color: '#cdd6f4' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, color: '#555', width: 72, textAlign: 'right', flexShrink: 0 }}>{lo}</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {Array.from({ length: points }, (_, i) => i + 1).map(v => (
            <button
              key={v}
              onClick={() => onChange(v)}
              style={{
                width: 38, height: 34, borderRadius: 4, border: 'none', cursor: 'pointer',
                background: value === v ? '#5a7aff' : '#1e1e3e',
                color: value === v ? '#fff' : '#666', fontSize: 13,
              }}
            >{v}</button>
          ))}
        </div>
        <span style={{ fontSize: 11, color: '#555', width: 72, flexShrink: 0 }}>{hi}</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify types compile**

```bash
pnpm tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/components/ConditionSurvey.tsx
git commit -m "feat: add ConditionSurvey component with NASA-TLX and smile questions"
```

---

## Task 4: Update `ExperimentPage` to use phase state

**Files:**
- Modify: `src/pages/ExperimentPage.tsx`

**Context:** The current page uses `const [resting, setResting] = useState(false)`. This task replaces it with a three-value `phase` union and inserts `ConditionSurvey` between condition completion and rest.

- [ ] **Step 1: Add import and phase type at the top of the file**

After the existing imports, add before `interface Props`:

```ts
import { ConditionSurvey, type ConditionSurveyAnswers } from '../components/ConditionSurvey'

type ExperimentPhase = 'running' | 'condition-survey' | 'resting'
```

- [ ] **Step 2: Replace `resting` state with `phase` state**

Find:
```ts
  const [resting, setResting] = useState(false)
```

Replace with:
```ts
  const [phase, setPhase] = useState<ExperimentPhase>('running')
```

- [ ] **Step 3: Update `onInput` callback inside the condition `useEffect`**

Find (inside the `ctrl.onInput` callback):
```ts
      if (manager.isConditionComplete()) {
        if (conditionIndex + 1 >= manager.getConditionOrder().length) {
          onNext()
        } else {
          setResting(true)
          setRestSecsLeft(REST_SECS)
        }
      }
```

Replace with:
```ts
      if (manager.isConditionComplete()) {
        if (conditionIndex + 1 >= manager.getConditionOrder().length) {
          onNext()
        } else {
          setPhase('condition-survey')
        }
      }
```

- [ ] **Step 4: Add `handleSurveySubmit` function (after `skipCondition`)**

```ts
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
      smileNaturalness:   answers.smileNaturalness ?? undefined,
      smileEmbarrassment: answers.smileEmbarrassment ?? undefined,
    })
    setRestSecsLeft(REST_SECS)
    setPhase('resting')
  }
```

- [ ] **Step 5: Update `skipPhrase` to use `setPhase`**

Find:
```ts
  const skipPhrase = () => {
    manager.nextPhrase()
    if (manager.isConditionComplete()) {
      if (conditionIndex + 1 >= manager.getConditionOrder().length) { onNext() }
      else { setResting(true); setRestSecsLeft(REST_SECS) }
    } else {
```

Replace with:
```ts
  const skipPhrase = () => {
    manager.nextPhrase()
    if (manager.isConditionComplete()) {
      if (conditionIndex + 1 >= manager.getConditionOrder().length) { onNext() }
      else { setPhase('condition-survey') }
    } else {
```

- [ ] **Step 6: Update `skipCondition` to use `setPhase`**

Find:
```ts
  const skipCondition = () => {
    if (conditionIndex + 1 >= manager.getConditionOrder().length) { onNext() }
    else { setResting(true); setRestSecsLeft(REST_SECS) }
  }
```

Replace with:
```ts
  const skipCondition = () => {
    if (conditionIndex + 1 >= manager.getConditionOrder().length) { onNext() }
    else { setRestSecsLeft(REST_SECS); setPhase('resting') }
  }
```

- [ ] **Step 7: Update rest timer `useEffect`**

Find:
```ts
  useEffect(() => {
    if (!resting) return
    const timer = setInterval(() => {
      setRestSecsLeft(s => {
        if (s <= 1) { clearInterval(timer); setResting(false); setConditionIndex(i => i + 1); return REST_SECS }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [resting])
```

Replace with:
```ts
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
```

- [ ] **Step 8: Update sidebar `isActive` / `isDone` expressions**

Find:
```ts
        const isActive = i === conditionIndex && !resting
        const isDone = i < conditionIndex || (i === conditionIndex && resting && manager.isConditionComplete())
```

Replace with:
```ts
        const isActive = i === conditionIndex && phase === 'running'
        const isDone = i < conditionIndex || (i === conditionIndex && phase !== 'running' && manager.isConditionComplete())
```

- [ ] **Step 9: Update the JSX render block**

Find (the `{resting ? (` ternary in the return):
```tsx
      {resting ? (
        <div style={{ ...centerStyle, paddingLeft: SIDEBAR_W }}>
          <h2 style={{ color: '#f1fa8c' }}>{t('experiment.rest')}</h2>
          <p style={{ color: '#aaa', fontSize: 18 }}>
            {t('experiment.restMessage', { seconds: String(restSecsLeft) })}
          </p>
          <button
            onClick={() => { setResting(false); setConditionIndex(i => i + 1) }}
            style={actionBtn}
          >
            {t('experiment.restSkip')}
          </button>
        </div>
      ) : (
```

Replace with:
```tsx
      {phase === 'condition-survey' ? (
        <div style={{ paddingLeft: SIDEBAR_W }}>
          <ConditionSurvey
            conditionIndex={conditionIndex}
            layout={condition.layout}
            inputMethod={condition.inputMethod}
            onSubmit={handleSurveySubmit}
          />
        </div>
      ) : phase === 'resting' ? (
        <div style={{ ...centerStyle, paddingLeft: SIDEBAR_W }}>
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
      ) : (
```

- [ ] **Step 10: Verify types compile**

```bash
pnpm tsc --noEmit
```

Expected: no output.

- [ ] **Step 11: Commit**

```bash
git add src/pages/ExperimentPage.tsx
git commit -m "feat: add condition-survey phase to ExperimentPage with NASA-TLX"
```

---

## Task 5: Extend `SurveyPage` with preference, demographics, and DB save

**Files:**
- Modify: `src/pages/SurveyPage.tsx`

**Context:** Currently SurveyPage only shows PANAS and doesn't save to DB. This task adds two more steps and saves a `final_survey` log on the final submit.

- [ ] **Step 1: Replace entire `src/pages/SurveyPage.tsx` with:**

```tsx
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { useI18n } from '../i18n'
import type { EventLog, InputMethod } from '../types'

interface Props {
  sessionId: string
  participantId: string
  addLog: (log: EventLog) => void
  onNext: () => void
}

type Step = 'panas' | 'preference' | 'demographics'

export function SurveyPage({ sessionId, participantId, addLog, onNext }: Props) {
  const { t } = useI18n()
  const [step, setStep] = useState<Step>('panas')

  // PANAS state
  const panasItems: string[] = t('panas.items') as unknown as string[]
  const scale: string[] = t('survey.scale') as unknown as string[]
  const [panasAnswers, setPanasAnswers] = useState<number[]>(new Array(20).fill(0))
  const panasAllAnswered = panasAnswers.every(a => a > 0)

  // Preference state
  const [preferenceOrder, setPreferenceOrder] = useState<InputMethod[]>(['dwell', 'blink', 'smile'])
  const moveUp = (i: number) => {
    if (i === 0) return
    setPreferenceOrder(prev => {
      const arr = [...prev];
      [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]
      return arr
    })
  }
  const moveDown = (i: number) => {
    if (i === preferenceOrder.length - 1) return
    setPreferenceOrder(prev => {
      const arr = [...prev];
      [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]]
      return arr
    })
  }

  // Demographics state
  const [age, setAge] = useState('')
  const [gender, setGender] = useState('')
  const [hasEyeCondition, setHasEyeCondition] = useState<boolean | null>(null)
  const demoComplete = age !== '' && gender !== '' && hasEyeCondition !== null

  const handleFinalSubmit = () => {
    addLog({
      sessionId,
      participantId,
      ts: Date.now(),
      type: 'final_survey',
      description: 'Final survey completed',
      panasAnswers: JSON.stringify(panasAnswers),
      preferenceRank: JSON.stringify(preferenceOrder),
      age: parseInt(age) || undefined,
      gender,
      hasEyeCondition: hasEyeCondition ?? undefined,
    })
    onNext()
  }

  if (step === 'panas') {
    return (
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 16px' }}>
        <h2 style={{ marginBottom: 8 }}>{t('survey.title')}</h2>
        <p style={{ color: '#888', marginBottom: 24, fontSize: 13 }}>{t('survey.instruction')}</p>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, marginBottom: 8 }}>
          {scale.map((s, i) => (
            <div key={i} style={{ width: 60, textAlign: 'center', fontSize: 11, color: '#666' }}>{i + 1}<br />{s}</div>
          ))}
        </div>

        {panasItems.map((item, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #222' }}>
            <span style={{ flex: 1 }}>{item}</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {[1, 2, 3, 4, 5].map(v => (
                <button
                  key={v}
                  onClick={() => setPanasAnswers(a => { const n = [...a]; n[idx] = v; return n })}
                  style={{
                    width: 60, height: 32, borderRadius: 4, border: 'none', cursor: 'pointer',
                    background: panasAnswers[idx] === v ? '#5a7aff' : '#1e1e3e',
                    color: panasAnswers[idx] === v ? '#fff' : '#888', fontSize: 13,
                  }}
                >{v}</button>
              ))}
            </div>
          </div>
        ))}

        <button
          onClick={() => setStep('preference')}
          disabled={!panasAllAnswered}
          style={{
            marginTop: 24, padding: '12px 32px', borderRadius: 8, border: 'none',
            background: panasAllAnswered ? '#5a7aff' : '#333',
            color: panasAllAnswered ? '#fff' : '#666',
            fontSize: 16, cursor: panasAllAnswered ? 'pointer' : 'not-allowed', width: '100%',
          }}
        >
          {t('finalSurvey.next')}
        </button>
      </div>
    )
  }

  if (step === 'preference') {
    return (
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '32px 16px' }}>
        <h2 style={{ marginBottom: 8 }}>{t('finalSurvey.preferenceTitle')}</h2>
        <p style={{ color: '#888', marginBottom: 24, fontSize: 13 }}>{t('finalSurvey.preferenceInstruction')}</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {preferenceOrder.map((method, i) => (
            <div key={method} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 16px', borderRadius: 8, background: '#1a1a2e',
              border: '1px solid #2a2a4e',
            }}>
              <span style={{ fontSize: 15, color: '#cdd6f4' }}>
                {i + 1}. {t(`finalSurvey.methodNames.${method}`)}
              </span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  onClick={() => moveUp(i)}
                  disabled={i === 0}
                  style={{ ...rankBtn, opacity: i === 0 ? 0.3 : 1 }}
                >↑</button>
                <button
                  onClick={() => moveDown(i)}
                  disabled={i === preferenceOrder.length - 1}
                  style={{ ...rankBtn, opacity: i === preferenceOrder.length - 1 ? 0.3 : 1 }}
                >↓</button>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={() => setStep('demographics')}
          style={{
            marginTop: 28, padding: '12px 32px', borderRadius: 8, border: 'none',
            background: '#5a7aff', color: '#fff', fontSize: 16, cursor: 'pointer', width: '100%',
          }}
        >
          {t('finalSurvey.next')}
        </button>
      </div>
    )
  }

  // step === 'demographics'
  const genderKeys = ['male', 'female', 'other', 'prefer_not'] as const
  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '32px 16px' }}>
      <h2 style={{ marginBottom: 24 }}>{t('finalSurvey.demographicsTitle')}</h2>

      <label style={labelStyle}>
        {t('finalSurvey.age')}
        <input
          type="number"
          min={10}
          max={99}
          value={age}
          onChange={e => setAge(e.target.value)}
          style={inputStyle}
          placeholder="—"
        />
      </label>

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 14, color: '#888', marginBottom: 8 }}>{t('finalSurvey.gender')}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {genderKeys.map(k => (
            <button
              key={k}
              onClick={() => setGender(k)}
              style={{
                padding: '8px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
                background: gender === k ? '#5a7aff' : '#1e1e3e',
                color: gender === k ? '#fff' : '#888', fontSize: 14,
              }}
            >
              {t(`finalSurvey.genderOptions.${k}`)}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 14, color: '#888', marginBottom: 8 }}>{t('finalSurvey.hasEyeCondition')}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {([true, false] as const).map(v => (
            <button
              key={String(v)}
              onClick={() => setHasEyeCondition(v)}
              style={{
                padding: '8px 24px', borderRadius: 6, border: 'none', cursor: 'pointer',
                background: hasEyeCondition === v ? '#5a7aff' : '#1e1e3e',
                color: hasEyeCondition === v ? '#fff' : '#888', fontSize: 14,
              }}
            >
              {v ? t('finalSurvey.yes') : t('finalSurvey.no')}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={handleFinalSubmit}
        disabled={!demoComplete}
        style={{
          padding: '12px 32px', borderRadius: 8, border: 'none',
          background: demoComplete ? '#50fa7b' : '#333',
          color: demoComplete ? '#000' : '#666',
          fontSize: 16, cursor: demoComplete ? 'pointer' : 'not-allowed', width: '100%',
        }}
      >
        {t('finalSurvey.submit')}
      </button>
    </div>
  )
}

const rankBtn: CSSProperties = {
  width: 32, height: 32, borderRadius: 4, border: '1px solid #333',
  background: 'transparent', color: '#888', fontSize: 16, cursor: 'pointer',
}

const labelStyle: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 6,
  fontSize: 14, color: '#888', marginBottom: 20,
}

const inputStyle: CSSProperties = {
  padding: '8px 12px', borderRadius: 6, border: '1px solid #333',
  background: '#1e1e3e', color: '#cdd6f4', fontSize: 16, width: 100,
}
```

- [ ] **Step 2: Verify types compile**

```bash
pnpm tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/pages/SurveyPage.tsx
git commit -m "feat: extend SurveyPage with preference ranking, demographics, and DB save"
```

---

## Task 6: Update `App.tsx` to pass new props to `SurveyPage`

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Update the `SurveyPage` render block**

Find:
```tsx
        {page === 'survey' && (
          <SurveyPage onNext={() => goTo('debug')} />
        )}
```

Replace with:
```tsx
        {page === 'survey' && session && (
          <SurveyPage
            sessionId={session.sessionId}
            participantId={session.participantId}
            addLog={addLog}
            onNext={() => goTo('debug')}
          />
        )}
```

- [ ] **Step 2: Verify types compile and tests pass**

```bash
pnpm tsc --noEmit && pnpm vitest run
```

Expected: no type errors, all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: wire SurveyPage to session and addLog in App"
```
