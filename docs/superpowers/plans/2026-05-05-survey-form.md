# SurveyForm 可复用问卷组件 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现配置驱动的 `SurveyForm` 组件，覆盖 6 种题型，重构现有问卷页，并新增实验前问卷页。

**Architecture:** `src/surveys/types.ts` 定义 `QuestionDef` 联合类型，`SurveyForm.tsx` 按题型渲染并收集答案，三份 config 文件描述各调查点的题目，`PreSurveyPage` 作为新页面插入 `tutorial → experiment` 之间。

**Tech Stack:** React 18, TypeScript (strict), Vite, IndexedDB via existing DataStore

---

## File Map

| 操作 | 文件 | 职责 |
|---|---|---|
| 新建 | `src/surveys/types.ts` | QuestionDef 联合类型 + SurveyAnswers |
| 新建 | `src/surveys/preSurvey.ts` | 实验前问卷 config |
| 新建 | `src/surveys/conditionSurvey.ts` | 条件后问卷 config 工厂函数 |
| 新建 | `src/surveys/finalSurvey.ts` | 最终问卷 config |
| 新建 | `src/components/SurveyForm.tsx` | 渲染组件，管理所有题型 state |
| 新建 | `src/pages/PreSurveyPage.tsx` | 实验前问卷页，保存 pre_survey 日志 |
| 修改 | `src/types.ts` | 新增 EventLogType + 字段 |
| 重构 | `src/components/ConditionSurvey.tsx` | 改用 SurveyForm，保留相同 Props |
| 重构 | `src/pages/SurveyPage.tsx` | 改用 SurveyForm，去除人口统计步骤 |
| 修改 | `src/pages/ExperimentPage.tsx` | handleSurveySubmit 加 fatigue 字段 |
| 修改 | `src/App.tsx` | 插入 pre-survey 页，更新流程跳转 |

---

## Task 1: Survey 类型定义

**Files:**
- Create: `src/surveys/types.ts`

- [ ] **Step 1: 创建 types.ts**

```ts
// src/surveys/types.ts

export type QuestionDef =
  | { id: string; type: 'text';        label: string; placeholder?: string }
  | { id: string; type: 'likert';      label: string; points: 5 | 7; lo: string; hi: string }
  | { id: string; type: 'score100';    label: string; subLabel?: string }
  | { id: string; type: 'radio';       label: string; options: { value: string; label: string }[] }
  | { id: string; type: 'panas_batch'; items: string[] }
  | { id: string; type: 'rank';        label: string; items: { value: string; label: string }[] }

export type SurveyAnswer = string | number | number[] | string[]
export type SurveyAnswers = Record<string, SurveyAnswer>
```

- [ ] **Step 2: 类型检查**

```bash
pnpm tsc --noEmit
```

期望：无错误。

- [ ] **Step 3: Commit**

```bash
git add src/surveys/types.ts
git commit -m "feat: add SurveyForm QuestionDef type definitions"
```

---

## Task 2: 扩展 types.ts（EventLog）

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: 在 EventLogType 加入 `'pre_survey'`**

找到：
```ts
export type EventLogType =
  | 'experiment_start'
  | 'phrase_show'
  | 'char_input'
  | 'condition_survey'
  | 'final_survey'
```

替换为：
```ts
export type EventLogType =
  | 'experiment_start'
  | 'phrase_show'
  | 'char_input'
  | 'condition_survey'
  | 'pre_survey'
  | 'final_survey'
```

- [ ] **Step 2: 在 EventLog 接口末尾加入新字段**

在 `hasEyeCondition?: boolean` 之后添加：
```ts
  // pre_survey:
  eyeTrackerExperience?: string  // 'never' | 'rarely' | 'often'
  panasPreAnswers?: string        // JSON.stringify(number[20]), values 1–5
  // condition_survey 新增:
  fatigue?: number                // 0–100
  // final_survey 新增:
  panasFinalAnswers?: string      // JSON.stringify(number[20])
  tamPU?: string                  // JSON.stringify({pu1,pu2,pu3}), values 1–7
  tamPEOU?: string                // JSON.stringify({eou1,eou2,eou3}), values 1–7
```

注：`panasAnswers` 保留（向后兼容旧数据），新代码只写 `panasPreAnswers` / `panasFinalAnswers`。

- [ ] **Step 3: 类型检查**

```bash
pnpm tsc --noEmit
```

期望：无错误。

- [ ] **Step 4: Commit**

```bash
git add src/types.ts
git commit -m "feat: extend EventLog with pre_survey type and new fields"
```

---

## Task 3: SurveyForm 组件

**Files:**
- Create: `src/components/SurveyForm.tsx`

- [ ] **Step 1: 创建 SurveyForm.tsx**

```tsx
// src/components/SurveyForm.tsx
import { useState } from 'react'
import type { CSSProperties } from 'react'
import type { QuestionDef, SurveyAnswers } from '../surveys/types'

interface Props {
  title?: string
  subtitle?: string
  questions: QuestionDef[]
  submitLabel?: string
  onSubmit: (answers: SurveyAnswers) => void
}

function initAnswers(questions: QuestionDef[]): SurveyAnswers {
  const init: SurveyAnswers = {}
  for (const q of questions) {
    if (q.type === 'panas_batch') init[q.id] = new Array(q.items.length).fill(0)
    else if (q.type === 'rank') init[q.id] = q.items.map(i => i.value)
    else if (q.type === 'score100') init[q.id] = 50
  }
  return init
}

function isComplete(q: QuestionDef, val: SurveyAnswers[string] | undefined): boolean {
  if (val === undefined) return false
  switch (q.type) {
    case 'text':        return (val as string).trim() !== ''
    case 'likert':      return (val as number) > 0
    case 'score100':    return true
    case 'radio':       return (val as string) !== ''
    case 'panas_batch': return (val as number[]).every(v => v > 0)
    case 'rank':        return true
  }
}

export function SurveyForm({ title, subtitle, questions, submitLabel = '提交', onSubmit }: Props) {
  const [answers, setAnswers] = useState<SurveyAnswers>(() => initAnswers(questions))

  const set = (id: string, val: SurveyAnswers[string]) =>
    setAnswers(prev => ({ ...prev, [id]: val }))

  const canSubmit = questions.every(q => isComplete(q, answers[q.id]))

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '32px 16px' }}>
      {title && <h2 style={{ marginBottom: subtitle ? 4 : 24 }}>{title}</h2>}
      {subtitle && <p style={{ color: '#888', marginBottom: 24, fontSize: 13 }}>{subtitle}</p>}

      {questions.map(q => (
        <QuestionRow
          key={q.id}
          q={q}
          value={answers[q.id]}
          onChange={val => set(q.id, val)}
        />
      ))}

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
    </div>
  )
}

// ── Question renderers ───────────────────────────────────────────────────────

function QuestionRow({ q, value, onChange }: {
  q: QuestionDef
  value: SurveyAnswers[string] | undefined
  onChange: (val: SurveyAnswers[string]) => void
}) {
  switch (q.type) {
    case 'text':
      return <TextQ q={q} value={(value as string) ?? ''} onChange={onChange} />
    case 'likert':
      return <LikertQ q={q} value={(value as number) ?? 0} onChange={onChange} />
    case 'score100':
      return <Score100Q q={q} value={(value as number) ?? 50} onChange={onChange} />
    case 'radio':
      return <RadioQ q={q} value={(value as string) ?? ''} onChange={onChange} />
    case 'panas_batch':
      return (
        <PanasBatchQ
          q={q}
          value={(value as number[]) ?? new Array(q.items.length).fill(0)}
          onChange={onChange}
        />
      )
    case 'rank':
      return (
        <RankQ
          q={q}
          value={(value as string[]) ?? q.items.map(i => i.value)}
          onChange={onChange}
        />
      )
  }
}

function TextQ({ q, value, onChange }: { q: Extract<QuestionDef, { type: 'text' }>; value: string; onChange: (v: string) => void }) {
  return (
    <div style={rowWrap}>
      <div style={rowLabel}>{q.label}</div>
      <input
        type="text"
        value={value}
        placeholder={q.placeholder}
        onChange={e => onChange(e.target.value)}
        style={textInput}
      />
    </div>
  )
}

function LikertQ({ q, value, onChange }: { q: Extract<QuestionDef, { type: 'likert' }>; value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ ...rowWrap, paddingBottom: 14 }}>
      <div style={rowLabel}>{q.label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={scaleEnd}>{q.lo}</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {Array.from({ length: q.points }, (_, i) => i + 1).map(v => (
            <button key={v} onClick={() => onChange(v)} style={scaleBtn(value === v)}>{v}</button>
          ))}
        </div>
        <span style={{ ...scaleEnd, textAlign: 'left' }}>{q.hi}</span>
      </div>
    </div>
  )
}

function Score100Q({ q, value, onChange }: { q: Extract<QuestionDef, { type: 'score100' }>; value: number; onChange: (v: number) => void }) {
  return (
    <div style={rowWrap}>
      <div style={rowLabel}>{q.label}</div>
      {q.subLabel && <div style={{ fontSize: 11, color: '#555', marginBottom: 8 }}>{q.subLabel}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <input
          type="range" min={0} max={100} value={value}
          onChange={e => onChange(Number(e.target.value))}
          style={{ flex: 1, accentColor: '#5a7aff' }}
        />
        <span style={{ width: 38, textAlign: 'right', fontSize: 16, fontWeight: 600, color: '#f1fa8c' }}>
          {value}
        </span>
      </div>
    </div>
  )
}

function RadioQ({ q, value, onChange }: { q: Extract<QuestionDef, { type: 'radio' }>; value: string; onChange: (v: string) => void }) {
  return (
    <div style={rowWrap}>
      <div style={rowLabel}>{q.label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {q.options.map(opt => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            style={radioBtn(value === opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function PanasBatchQ({ q, value, onChange }: {
  q: Extract<QuestionDef, { type: 'panas_batch' }>
  value: number[]
  onChange: (v: number[]) => void
}) {
  const set = (idx: number, v: number) => {
    const next = [...value]; next[idx] = v; onChange(next)
  }
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, marginBottom: 6 }}>
        {[1, 2, 3, 4, 5].map(v => (
          <div key={v} style={{ width: 40, textAlign: 'center', fontSize: 10, color: '#555' }}>{v}</div>
        ))}
      </div>
      {q.items.map((item, idx) => (
        <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #161c28' }}>
          <span style={{ flex: 1, fontSize: 14 }}>{item}</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {[1, 2, 3, 4, 5].map(v => (
              <button
                key={v}
                onClick={() => set(idx, v)}
                style={scaleBtn(value[idx] === v, 40)}
              >{v}</button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function RankQ({ q, value, onChange }: {
  q: Extract<QuestionDef, { type: 'rank' }>
  value: string[]
  onChange: (v: string[]) => void
}) {
  const labelOf = (val: string) => q.items.find(i => i.value === val)?.label ?? val

  const swap = (i: number, j: number) => {
    const next = [...value]; [next[i], next[j]] = [next[j], next[i]]; onChange(next)
  }

  return (
    <div style={rowWrap}>
      <div style={rowLabel}>{q.label}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {value.map((val, i) => (
          <div key={val} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 7, background: '#141c2e', border: '1px solid #1e2840' }}>
            <span style={{ fontSize: 13, color: '#555', marginRight: 10 }}>{i + 1}.</span>
            <span style={{ flex: 1, fontSize: 14 }}>{labelOf(val)}</span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={() => i > 0 && swap(i, i - 1)} disabled={i === 0} style={rankArrow(i === 0)}>↑</button>
              <button onClick={() => i < value.length - 1 && swap(i, i + 1)} disabled={i === value.length - 1} style={rankArrow(i === value.length - 1)}>↓</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Shared styles ────────────────────────────────────────────────────────────

const rowWrap: CSSProperties = {
  padding: '10px 0', borderBottom: '1px solid #1e1e3e', marginBottom: 4,
}

const rowLabel: CSSProperties = {
  fontSize: 14, color: '#cdd6f4', marginBottom: 10,
}

const textInput: CSSProperties = {
  padding: '8px 12px', borderRadius: 6, border: '1px solid #2a3050',
  background: '#141820', color: '#cdd6f4', fontSize: 15, width: 180,
}

const scaleEnd: CSSProperties = {
  fontSize: 11, color: '#555', width: 72, textAlign: 'right', flexShrink: 0,
}

const scaleBtn = (active: boolean, w = 40): React.CSSProperties => ({
  width: w, height: 34, borderRadius: 4, border: 'none', cursor: 'pointer',
  background: active ? '#5a7aff' : '#1a2030',
  color: active ? '#fff' : '#666', fontSize: 13,
})

const radioBtn = (active: boolean): React.CSSProperties => ({
  padding: '8px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
  background: active ? '#5a7aff' : '#1e1e3e',
  color: active ? '#fff' : '#888', fontSize: 14,
})

const rankArrow = (disabled: boolean): React.CSSProperties => ({
  width: 28, height: 28, borderRadius: 4, border: '1px solid #2a3050',
  background: 'transparent', color: disabled ? '#2a3050' : '#888',
  cursor: disabled ? 'default' : 'pointer', fontSize: 14,
})
```

- [ ] **Step 2: 类型检查**

```bash
pnpm tsc --noEmit
```

期望：无错误。

- [ ] **Step 3: Commit**

```bash
git add src/components/SurveyForm.tsx
git commit -m "feat: add SurveyForm reusable survey renderer (6 question types)"
```

---

## Task 4: 三份问卷 config 文件

**Files:**
- Create: `src/surveys/preSurvey.ts`
- Create: `src/surveys/conditionSurvey.ts`
- Create: `src/surveys/finalSurvey.ts`

- [ ] **Step 1: 创建 `src/surveys/preSurvey.ts`**

```ts
// src/surveys/preSurvey.ts
import type { QuestionDef } from './types'

const PANAS_ITEMS = [
  '感兴趣的','苦恼的','兴奋的','烦乱的','强壮的','有罪恶感的','害怕的','热情的',
  '自豪的','易怒的','警觉的','惭愧的','受鼓舞的','紧张的','坚定的','专注的',
  '坐立不安的','积极的','恐惧的','敌意的',
]

export const PRE_SURVEY: QuestionDef[] = [
  {
    id: 'age', type: 'text', label: '年龄', placeholder: '请输入数字',
  },
  {
    id: 'gender', type: 'radio', label: '性别',
    options: [
      { value: 'male', label: '男' },
      { value: 'female', label: '女' },
      { value: 'other', label: '其他' },
      { value: 'prefer_not', label: '不愿透露' },
    ],
  },
  {
    id: 'eyeTracker', type: 'radio', label: '您是否使用过眼动仪设备？',
    options: [
      { value: 'never', label: '从未' },
      { value: 'rarely', label: '偶尔' },
      { value: 'often', label: '经常' },
    ],
  },
  {
    id: 'eyeCondition', type: 'radio', label: '您是否有眼部或面部肌肉疾病？',
    options: [
      { value: 'yes', label: '是' },
      { value: 'no', label: '否' },
    ],
  },
  {
    id: 'panas_pre', type: 'panas_batch', items: PANAS_ITEMS,
  },
]
```

- [ ] **Step 2: 创建 `src/surveys/conditionSurvey.ts`**

```ts
// src/surveys/conditionSurvey.ts
import type { QuestionDef } from './types'
import type { InputMethod } from '../types'

const SMILE_SCALE_LO = '完全不同意'
const SMILE_SCALE_HI = '完全同意'

export function getConditionSurveyQuestions(inputMethod: InputMethod): QuestionDef[] {
  const questions: QuestionDef[] = [
    { id: 'tlxMental',      type: 'likert', points: 7, label: '脑力需求',    lo: '极低', hi: '极高' },
    { id: 'tlxPhysical',    type: 'likert', points: 7, label: '体力需求',    lo: '极低', hi: '极高' },
    { id: 'tlxTemporal',    type: 'likert', points: 7, label: '时间压力',    lo: '极低', hi: '极高' },
    { id: 'tlxPerformance', type: 'likert', points: 7, label: '表现满意度',  lo: '非常满意', hi: '非常不满意' },
    { id: 'tlxEffort',      type: 'likert', points: 7, label: '努力程度',    lo: '极低', hi: '极高' },
    { id: 'tlxHappiness',   type: 'likert', points: 7, label: '愉悦感',      lo: '极低', hi: '极高' },
    { id: 'fatigue', type: 'score100', label: '当前疲劳程度', subLabel: '0 = 完全不疲劳　·　100 = 极度疲劳' },
  ]

  if (inputMethod === 'smile') {
    questions.push(
      { id: 'smileNaturalness',   type: 'likert', points: 5, label: '用微笑选字让我感到不自然',         lo: SMILE_SCALE_LO, hi: SMILE_SCALE_HI },
      { id: 'smileEmbarrassment', type: 'likert', points: 5, label: '如果在公开场合使用，我会感到尴尬', lo: SMILE_SCALE_LO, hi: SMILE_SCALE_HI },
    )
  }

  return questions
}
```

- [ ] **Step 3: 创建 `src/surveys/finalSurvey.ts`**

```ts
// src/surveys/finalSurvey.ts
import type { QuestionDef } from './types'

const PANAS_ITEMS = [
  '感兴趣的','苦恼的','兴奋的','烦乱的','强壮的','有罪恶感的','害怕的','热情的',
  '自豪的','易怒的','警觉的','惭愧的','受鼓舞的','紧张的','坚定的','专注的',
  '坐立不安的','积极的','恐惧的','敌意的',
]

const TAM_LO = '完全不同意'
const TAM_HI = '完全同意'

export const FINAL_SURVEY: QuestionDef[] = [
  { id: 'panas_post', type: 'panas_batch', items: PANAS_ITEMS },
  { id: 'pu1',  type: 'likert', points: 7, lo: TAM_LO, hi: TAM_HI, label: '我认为微笑输入能提高我的输入效率。' },
  { id: 'pu2',  type: 'likert', points: 7, lo: TAM_LO, hi: TAM_HI, label: '在双手不便的情况下，我认为这种方式非常有用。' },
  { id: 'pu3',  type: 'likert', points: 7, lo: TAM_LO, hi: TAM_HI, label: '我认为这种系统能让我更轻松地控制设备。' },
  { id: 'eou1', type: 'likert', points: 7, lo: TAM_LO, hi: TAM_HI, label: '我预期学习如何使用微笑输入会非常容易。' },
  { id: 'eou2', type: 'likert', points: 7, lo: TAM_LO, hi: TAM_HI, label: '我认为通过微笑来操作不会花费我太多精力。' },
  { id: 'eou3', type: 'likert', points: 7, lo: TAM_LO, hi: TAM_HI, label: '我预期这个系统的交互逻辑是清晰易懂的。' },
  {
    id: 'preference', type: 'rank', label: '请将三种输入方式从最喜欢（上）到最不喜欢（下）排序',
    items: [
      { value: 'dwell', label: '注视输入' },
      { value: 'blink', label: '眨眼输入' },
      { value: 'smile', label: '微笑输入' },
    ],
  },
]
```

- [ ] **Step 4: 类型检查**

```bash
pnpm tsc --noEmit
```

期望：无错误。

- [ ] **Step 5: Commit**

```bash
git add src/surveys/
git commit -m "feat: add pre/condition/final survey configs"
```

---

## Task 5: 重构 ConditionSurvey

**Files:**
- Modify: `src/components/ConditionSurvey.tsx`
- Modify: `src/pages/ExperimentPage.tsx`

- [ ] **Step 1: 更新 `ConditionSurveyAnswers` 接口，加入 `fatigue`**

在 `src/components/ConditionSurvey.tsx` 中，找到：
```ts
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
```

替换为：
```ts
export interface ConditionSurveyAnswers {
  tlxMental: number
  tlxPhysical: number
  tlxTemporal: number
  tlxPerformance: number
  tlxEffort: number
  tlxHappiness: number
  fatigue: number
  smileNaturalness: number | null
  smileEmbarrassment: number | null
}
```

- [ ] **Step 2: 用 SurveyForm 重写 ConditionSurvey 组件主体**

将 `src/components/ConditionSurvey.tsx` 整个替换为：

```tsx
// src/components/ConditionSurvey.tsx
import { useI18n } from '../i18n'
import type { Layout, InputMethod } from '../types'
import { SurveyForm } from './SurveyForm'
import { getConditionSurveyQuestions } from '../surveys/conditionSurvey'
import type { SurveyAnswers } from '../surveys/types'

export interface ConditionSurveyAnswers {
  tlxMental: number
  tlxPhysical: number
  tlxTemporal: number
  tlxPerformance: number
  tlxEffort: number
  tlxHappiness: number
  fatigue: number
  smileNaturalness: number | null
  smileEmbarrassment: number | null
}

interface Props {
  conditionIndex: number
  layout: Layout
  inputMethod: InputMethod
  onSubmit: (answers: ConditionSurveyAnswers) => void
}

const METHOD_ZH: Record<InputMethod, string> = { dwell: '注视', blink: '眨眼', smile: '微笑' }

export function ConditionSurvey({ conditionIndex, layout, inputMethod, onSubmit }: Props) {
  const { t } = useI18n()

  const handleSubmit = (raw: SurveyAnswers) => {
    onSubmit({
      tlxMental:          raw.tlxMental      as number,
      tlxPhysical:        raw.tlxPhysical    as number,
      tlxTemporal:        raw.tlxTemporal    as number,
      tlxPerformance:     raw.tlxPerformance as number,
      tlxEffort:          raw.tlxEffort      as number,
      tlxHappiness:       raw.tlxHappiness   as number,
      fatigue:            raw.fatigue        as number,
      smileNaturalness:   inputMethod === 'smile' ? (raw.smileNaturalness as number) : null,
      smileEmbarrassment: inputMethod === 'smile' ? (raw.smileEmbarrassment as number) : null,
    })
  }

  return (
    <SurveyForm
      title={t('conditionSurvey.title') as string}
      subtitle={t('conditionSurvey.subtitle', {
        index: String(conditionIndex + 1),
        layout: layout.toUpperCase(),
        method: METHOD_ZH[inputMethod],
      }) as string}
      questions={getConditionSurveyQuestions(inputMethod)}
      submitLabel={t('conditionSurvey.submit') as string}
      onSubmit={handleSubmit}
    />
  )
}
```

- [ ] **Step 3: 更新 ExperimentPage 的 handleSurveySubmit，加入 fatigue**

在 `src/pages/ExperimentPage.tsx` 中，找到：
```ts
      smileNaturalness:   answers.smileNaturalness ?? undefined,
      smileEmbarrassment: answers.smileEmbarrassment ?? undefined,
```

在这两行之前插入：
```ts
      fatigue:            answers.fatigue,
```

- [ ] **Step 4: 类型检查**

```bash
pnpm tsc --noEmit
```

期望：无错误。

- [ ] **Step 5: Commit**

```bash
git add src/components/ConditionSurvey.tsx src/pages/ExperimentPage.tsx
git commit -m "refactor: ConditionSurvey uses SurveyForm, adds fatigue question"
```

---

## Task 6: 重构 SurveyPage（最终问卷）

**Files:**
- Modify: `src/pages/SurveyPage.tsx`

- [ ] **Step 1: 用 SurveyForm 重写 SurveyPage**

将 `src/pages/SurveyPage.tsx` 整个替换为：

```tsx
// src/pages/SurveyPage.tsx
import type { EventLog } from '../types'
import { SurveyForm } from '../components/SurveyForm'
import { FINAL_SURVEY } from '../surveys/finalSurvey'
import type { SurveyAnswers } from '../surveys/types'

interface Props {
  sessionId: string
  participantId: string
  addLog: (log: EventLog) => void
  onNext: () => void
}

export function SurveyPage({ sessionId, participantId, addLog, onNext }: Props) {
  const handleSubmit = (answers: SurveyAnswers) => {
    const tamPU = {
      pu1: answers.pu1 as number,
      pu2: answers.pu2 as number,
      pu3: answers.pu3 as number,
    }
    const tamPEOU = {
      eou1: answers.eou1 as number,
      eou2: answers.eou2 as number,
      eou3: answers.eou3 as number,
    }

    addLog({
      sessionId,
      participantId,
      ts: Date.now(),
      type: 'final_survey',
      description: 'Final survey completed',
      panasFinalAnswers: JSON.stringify(answers.panas_post),
      tamPU:            JSON.stringify(tamPU),
      tamPEOU:          JSON.stringify(tamPEOU),
      preferenceRank:   JSON.stringify(answers.preference),
    })
    onNext()
  }

  return (
    <SurveyForm
      title="实验结束问卷"
      questions={FINAL_SURVEY}
      submitLabel="提交"
      onSubmit={handleSubmit}
    />
  )
}
```

- [ ] **Step 2: 类型检查**

```bash
pnpm tsc --noEmit
```

期望：无错误。

- [ ] **Step 3: Commit**

```bash
git add src/pages/SurveyPage.tsx
git commit -m "refactor: SurveyPage uses SurveyForm with PANAS-post + TAM + rank"
```

---

## Task 7: 新建 PreSurveyPage

**Files:**
- Create: `src/pages/PreSurveyPage.tsx`

- [ ] **Step 1: 创建 PreSurveyPage**

```tsx
// src/pages/PreSurveyPage.tsx
import type { EventLog } from '../types'
import { SurveyForm } from '../components/SurveyForm'
import { PRE_SURVEY } from '../surveys/preSurvey'
import type { SurveyAnswers } from '../surveys/types'

interface Props {
  sessionId: string
  participantId: string
  addLog: (log: EventLog) => void
  onNext: () => void
}

export function PreSurveyPage({ sessionId, participantId, addLog, onNext }: Props) {
  const handleSubmit = (answers: SurveyAnswers) => {
    addLog({
      sessionId,
      participantId,
      ts: Date.now(),
      type: 'pre_survey',
      description: 'Pre-experiment survey completed',
      age:                  parseInt(answers.age as string) || undefined,
      gender:               answers.gender as string,
      eyeTrackerExperience: answers.eyeTracker as string,
      hasEyeCondition:      answers.eyeCondition === 'yes',
      panasPreAnswers:      JSON.stringify(answers.panas_pre),
    })
    onNext()
  }

  return (
    <SurveyForm
      title="实验前问卷"
      subtitle="请在开始实验前填写以下信息"
      questions={PRE_SURVEY}
      submitLabel="开始实验"
      onSubmit={handleSubmit}
    />
  )
}
```

- [ ] **Step 2: 类型检查**

```bash
pnpm tsc --noEmit
```

期望：无错误。

- [ ] **Step 3: Commit**

```bash
git add src/pages/PreSurveyPage.tsx
git commit -m "feat: add PreSurveyPage with demographics and PANAS-pre"
```

---

## Task 8: 接入 App.tsx

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/types.ts`

- [ ] **Step 1: 在 `src/types.ts` 的 AppPage 加入 `'pre-survey'`**

找到：
```ts
export type AppPage =
  | 'debug'
  | 'experimenter-config'
  | 'welcome'
  | 'typing-test'
  | 'tutorial'
  | 'experiment'
  | 'survey'
```

替换为：
```ts
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

- [ ] **Step 2: 更新 App.tsx — import 和流程**

在 `src/App.tsx` 顶部 import 区块加入：
```ts
import { PreSurveyPage } from './pages/PreSurveyPage'
```

找到 `TutorialPage` 的 `onNext`：
```tsx
            goTo('experiment')
```
替换为：
```tsx
            goTo('pre-survey')
```

在 `{page === 'experiment' && session && (` 之前插入：
```tsx
        {page === 'pre-survey' && session && (
          <PreSurveyPage
            sessionId={session.sessionId}
            participantId={session.participantId}
            addLog={addLog}
            onNext={() => goTo('experiment')}
          />
        )}
```

- [ ] **Step 3: 类型检查 + 构建**

```bash
pnpm tsc --noEmit && pnpm build
```

期望：无错误，构建成功。

- [ ] **Step 4: 手动验证流程**

```bash
pnpm dev --host
```

走一遍完整流程：
1. debug → experimenter-config → welcome → typing-test → tutorial
2. tutorial 完成后应跳到 **pre-survey 页**（显示"实验前问卷"标题）
3. 所有题填完后点「开始实验」，应跳到 experiment 页
4. 完成一个条件后跳到 condition-survey（含疲劳滑块）
5. 实验全部完成后跳到最终问卷（含 PANAS + TAM + 排序）

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/App.tsx
git commit -m "feat: wire PreSurveyPage into app flow (tutorial → pre-survey → experiment)"
```
