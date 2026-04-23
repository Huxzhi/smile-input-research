# Survey System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-condition NASA-TLX survey (+ smile-specific questions) and extend the final survey with PANAS save, preference ranking, and demographics — all stored in IndexedDB via existing `DataStore.saveLog`.

**Architecture:** Per-condition survey is a sub-state inside `ExperimentPage` (same pattern as the existing rest screen). Final survey extends the existing `SurveyPage`. All answers are stored as flat `EventLog` entries with new types `condition_survey` and `final_survey`.

**Tech Stack:** React + TypeScript, existing `DataStore` / `EventLog` / `addLog` infrastructure, `useI18n` for all strings.

---

## Data Model

### `EventLogType` additions (`src/types.ts`)

```ts
export type EventLogType =
  | 'experiment_start'
  | 'phrase_show'
  | 'char_input'
  | 'condition_survey'   // new
  | 'final_survey'       // new
```

### New optional fields on `EventLog` (`src/types.ts`)

```ts
// condition_survey fields (NASA-TLX, 1–7 each)
tlxMental?:           number
tlxPhysical?:         number
tlxTemporal?:         number
tlxPerformance?:      number
tlxEffort?:           number
tlxHappiness?:        number
// smile-specific (1–5, only present when inputMethod === 'smile')
smileNaturalness?:    number
smileEmbarrassment?:  number

// final_survey fields
panasAnswers?:        string   // JSON.stringify(number[20]), 1–5 each
preferenceRank?:      string   // JSON.stringify(['smile'|'dwell'|'blink'][3]), best→worst
age?:                 number
gender?:              string   // 'male' | 'female' | 'other' | 'prefer_not'
hasEyeCondition?:     boolean
```

---

## Component Architecture

### New: `src/components/ConditionSurvey.tsx`

```ts
interface ConditionSurveyAnswers {
  tlxMental: number       // 1–7
  tlxPhysical: number
  tlxTemporal: number
  tlxPerformance: number
  tlxEffort: number
  tlxHappiness: number
  smileNaturalness: number | null    // null when inputMethod !== 'smile'
  smileEmbarrassment: number | null
}

interface Props {
  conditionIndex: number
  layout: Layout
  inputMethod: InputMethod
  onSubmit: (answers: ConditionSurveyAnswers) => void
}
```

Renders NASA-TLX (6 rows, 7-point segmented control) plus 2 smile rows when `inputMethod === 'smile'`. Submit button enabled only when all required items are answered.

### Modified: `src/pages/ExperimentPage.tsx`

Add `ExperimentPhase` union:
```ts
type ExperimentPhase = 'running' | 'condition-survey' | 'resting'
```

Replace `const [resting, setResting]` with `const [phase, setPhase]`.

Transition logic:
- Condition complete + not last condition → `setPhase('condition-survey')`
- Last condition complete → `onNext()` (no survey, go straight to final)
- Survey submitted → save `condition_survey` log → `setPhase('resting')`
- Rest timer expires or skip → `setPhase('running')` + `setConditionIndex(i => i + 1)`

The `<video>` element stays mounted unconditionally (already fixed).

### Modified: `src/pages/SurveyPage.tsx`

Add `addLog` and `sessionId`/`participantId` to Props:
```ts
interface Props {
  sessionId: string
  participantId: string
  addLog: (log: EventLog) => void
  onNext: () => void
}
```

Three-step flow within the page (local `step` state: `'panas' | 'preference' | 'demographics'`):

1. **PANAS** — existing 20-item display, unchanged. "下一步" button advances to preference.
2. **Preference ranking** — three cards (注视输入 / 眨眼输入 / 微笑输入), ↑↓ buttons to reorder, default order is fixed: dwell → blink → smile.
3. **Demographics** — age (number input), gender (4 radio options), eye/face condition (yes/no toggle). Submit calls `addLog` with `final_survey` log then `onNext()`.

### Modified: `src/App.tsx`

Pass `sessionId`, `participantId`, `addLog` to `SurveyPage`. `session` is guaranteed non-null at this point (set at experimenter-config, before experiment starts):
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

---

## i18n Keys

Add to `src/i18n/zh.json`, `en.json`, `ja.json`:

```json
"conditionSurvey": {
  "title": "本轮完成——请评价一下",
  "subtitle": "条件 {index}：{layout} / {method}",
  "submit": "提交并休息",
  "tlx": {
    "mental":      { "label": "脑力需求",   "lo": "极低", "hi": "极高" },
    "physical":    { "label": "体力需求",   "lo": "极低", "hi": "极高" },
    "temporal":    { "label": "时间压力",   "lo": "极低", "hi": "极高" },
    "performance": { "label": "表现满意度", "lo": "非常满意", "hi": "非常不满意" },
    "effort":      { "label": "努力程度",   "lo": "极低", "hi": "极高" },
    "happiness":   { "label": "愉悦感",     "lo": "极低", "hi": "极高" }
  },
  "smileNaturalness":   "用微笑选字让我感到不自然",
  "smileEmbarrassment": "如果在公开场合使用，我会感到尴尬",
  "smileScale": ["完全不同意", "不同意", "中立", "同意", "完全同意"]
},
"finalSurvey": {
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

---

## Survey Content Reference

### NASA-TLX (7-point, shown in `ConditionSurvey`)

| Key | Question | Low anchor | High anchor |
|-----|----------|------------|-------------|
| mental | 这个任务需要多少脑力？ | 极低 | 极高 |
| physical | 这个任务需要多少体力？ | 极低 | 极高 |
| temporal | 你感到时间压力有多大？ | 极低 | 极高 |
| performance | 你对自己的表现满意吗？ | 非常满意 | 非常不满意 |
| effort | 为了完成任务你付出了多少努力？ | 极低 | 极高 |
| happiness | 完成这项任务让你感到高兴吗？ | 极低 | 极高 |

### Smile-specific (5-point Likert, only for smile conditions)

1. 用微笑选字让我感到不自然（1=完全不同意 → 5=完全同意）
2. 如果在公开场合使用，我会感到尴尬（1=完全不同意 → 5=完全同意）

---

## Files Changed

| File | Action |
|------|--------|
| `src/types.ts` | Add `condition_survey`, `final_survey` to `EventLogType`; add 13 optional fields to `EventLog` |
| `src/components/ConditionSurvey.tsx` | Create — NASA-TLX + smile questions component |
| `src/pages/ExperimentPage.tsx` | Replace `resting` bool with `phase` union; render `ConditionSurvey` in `condition-survey` phase |
| `src/pages/SurveyPage.tsx` | Add preference + demographics steps; accept `addLog`; save `final_survey` log on submit |
| `src/App.tsx` | Pass `sessionId`, `participantId`, `addLog` to `SurveyPage` |
| `src/i18n/zh.json` | Add `conditionSurvey.*` and `finalSurvey.*` keys |
| `src/i18n/en.json` | Same |
| `src/i18n/ja.json` | Same |
