# SurveyForm 可复用问卷组件 — 设计文档

## 背景

实验流程中有三个调查节点（实验前、每个条件后、实验结束后），各自包含不同题型。
现有代码中 `ConditionSurvey.tsx` 和 `SurveyPage.tsx` 各自硬编码，无法复用。
本设计将所有问卷统一为一个配置驱动的 `SurveyForm` 组件。

---

## 题型 Schema

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

### 各题型答案格式

| type | answers[id] 类型 | 示例 |
|---|---|---|
| `text` | `string` | `"25"` |
| `likert` | `number` (1–N) | `4` |
| `score100` | `number` (0–100) | `55` |
| `radio` | `string` (option.value) | `"female"` |
| `panas_batch` | `number[]` (length = items.length) | `[3,1,4,...]` |
| `rank` | `string[]` (有序 value) | `["smile","dwell","blink"]` |

---

## SurveyForm 组件 API

```tsx
// src/components/SurveyForm.tsx

interface Props {
  title?: string
  subtitle?: string
  questions: QuestionDef[]
  submitLabel?: string
  onSubmit: (answers: SurveyAnswers) => void
}
```

- 提交按钮在所有必答题都有值时才激活
- `panas_batch` 的每一项都必须选择才算完成
- 组件内部管理 state，不向外暴露中间状态

---

## 三份问卷 Config

### 1. 实验前问卷 (`src/surveys/preSurvey.ts`)

| id | type | 内容 |
|---|---|---|
| `age` | `text` | 年龄 |
| `gender` | `radio` | 男 / 女 / 其他 / 不愿透露 |
| `eyeTracker` | `radio` | 使用过眼动仪？从未 / 偶尔 / 经常 |
| `eyeCondition` | `radio` | 眼部或面部肌肉疾病？是 / 否 |
| `panas_pre` | `panas_batch` | PANAS 20 项（1–5） |

### 2. 条件后问卷 (`src/surveys/conditionSurvey.ts`)

工厂函数 `getConditionSurveyQuestions(inputMethod)` 返回：

| id | type | 内容 |
|---|---|---|
| `tlxMental` | `likert 7` | 脑力需求（极低→极高） |
| `tlxPhysical` | `likert 7` | 体力需求 |
| `tlxTemporal` | `likert 7` | 时间压力 |
| `tlxPerformance` | `likert 7` | 表现满意度（非常满意→非常不满意） |
| `tlxEffort` | `likert 7` | 努力程度 |
| `tlxHappiness` | `likert 7` | 愉悦感 |
| `fatigue` | `score100` | 当前疲劳程度（0=完全不疲劳，100=极度疲劳） |
| `smileNaturalness` *(smile only)* | `likert 5` | 用微笑选字让我感到不自然 |
| `smileEmbarrassment` *(smile only)* | `likert 5` | 公开场合使用会感到尴尬 |

### 3. 最终问卷 (`src/surveys/finalSurvey.ts`)

| id | type | 内容 |
|---|---|---|
| `panas_post` | `panas_batch` | PANAS 20 项（实验后情绪） |
| `pu1`–`pu3` | `likert 7` | TAM 预期有用性（完全不同意→完全同意） |
| `eou1`–`eou3` | `likert 7` | TAM 预期易用性 |
| `preference` | `rank` | 三种输入方式偏好排序 |

---

## App 流程变更

```
(旧) tutorial → experiment → survey
(新) tutorial → pre-survey → experiment → survey(final)
```

- `AppPage` 类型新增 `'pre-survey'`
- 新建 `PreSurveyPage`，接收 `onNext` 回调
- `TutorialPage.onNext` 跳转到 `'pre-survey'` 而非 `'experiment'`

---

## types.ts 变更

### 新增 EventLogType
```ts
| 'pre_survey'
```

### EventLog 新增字段

```ts
// pre_survey:
eyeTrackerExperience?: string   // 'never' | 'rarely' | 'often'
panasPreAnswers?: string         // JSON.stringify(number[20])
// (age / gender / hasEyeCondition 从 final_survey 移至 pre_survey)

// condition_survey 新增:
fatigue?: number                 // 0–100

// final_survey 新增:
panasFinalAnswers?: string       // JSON.stringify(number[20])
tamPU?: string                   // JSON.stringify({pu1,pu2,pu3})
tamPEOU?: string                 // JSON.stringify({eou1,eou2,eou3})
// panasAnswers 保留字段定义（向后兼容旧数据），新代码只写 panasPreAnswers / panasFinalAnswers
```

---

## 文件清单

| 操作 | 文件 |
|---|---|
| 新建 | `src/surveys/types.ts` |
| 新建 | `src/surveys/preSurvey.ts` |
| 新建 | `src/surveys/conditionSurvey.ts` |
| 新建 | `src/surveys/finalSurvey.ts` |
| 新建 | `src/components/SurveyForm.tsx` |
| 新建 | `src/pages/PreSurveyPage.tsx` |
| 重构 | `src/components/ConditionSurvey.tsx` → 使用 SurveyForm |
| 重构 | `src/pages/SurveyPage.tsx` → 使用 SurveyForm |
| 修改 | `src/types.ts` — 新增 EventLogType 和字段 |
| 修改 | `src/App.tsx` — 加入 pre-survey 页 |
