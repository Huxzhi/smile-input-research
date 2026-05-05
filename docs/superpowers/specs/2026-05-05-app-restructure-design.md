# App 双页重构设计文档

## 背景

现有 App 有 8 个页面通过状态机切换，结构分散、调试困难、无法快速跳转到任意步骤。
本设计将其简化为两个视图（setup / flow），并在顶部添加固定流程导航条，支持步骤预览和跳转。

---

## 架构概览

```
App.tsx
├── mode = 'setup'  →  SetupPage
└── mode = 'flow'   →  FlowPage
```

`App.tsx` 只有两个状态：`'setup' | 'flow'`，无路由库依赖。

---

## SetupPage（`src/pages/SetupPage.tsx`）

### 布局

```
┌─────────────────────────────────────────────────────┐
│ StepNav（6 步导航条，点击预览对应步骤）                  │
├─────────────────────────────────────────────────────┤
│ 步骤预览区                                            │
│ - 未选中时：显示提示文字                                │
│ - 选中步骤后：渲染该步骤组件                             │
│ - 若 ID 输入框有值且该 ID 有历史数据：自动填入已保存内容    │
├─────────────────────────────────────────────────────┤
│ 调试面板（现有 DebugPage 内容）                         │
│ 参与者 ID 输入框 + 条件顺序选择 + 「开始实验」按钮         │
└─────────────────────────────────────────────────────┘
```

### 行为

- **ID 输入**：输入参与者 ID 后检查 localStorage，若有历史数据则在导航条高亮已完成步骤
- **点击导航步骤**：预览区渲染该步骤组件，自动注入该 ID 的历史答案（`initialAnswers`）
- **「开始实验」**：生成 session（ID + 条件顺序 + smileThreshold=0.6 默认值），切换 mode 为 `'flow'`，从 `flow_step_{id}` 恢复步骤索引（若存在）
- **条件顺序**：下拉选择 Latin Square 顺序（0–5），决定 6 个条件的排列，不改变条件内容

---

## FlowPage（`src/pages/FlowPage.tsx`）

### 布局

```
┌─────────────────────────────────────────────────────┐
│ StepNav（6 步，当前步骤高亮，已完成步骤可点击跳回）       │
├─────────────────────────────────────────────────────┤
│                                                     │
│         当前步骤组件（全屏）                            │
│                                                     │
│                             [下一步 →]               │
└─────────────────────────────────────────────────────┘
```

### 步骤定义

| 索引 | 名称 | 组件 | 可回跳 |
|---|---|---|---|
| 0 | 欢迎介绍 | `WelcomePage`（扩展加入实验说明） | ✓ |
| 1 | 个人信息 | `SurveyForm`（demographics 部分）| ✓ |
| 2 | 实验前问卷 | `SurveyForm`（PANAS）| ✓ |
| 3 | 微笑校准 | `TutorialPage` | ✓ |
| 4 | 6 条件实验 | `ExperimentPage` | ✗（实验进行中锁定）|
| 5 | 结束问卷 | `SurveyForm`（TAM + PANAS-post + 排序）| ✓ |

### 行为

- **导航条**：步骤 0–3、5 完成后可点击跳回；步骤 4（实验中）锁定，`isConditionComplete` 全部完成才可离开
- **下一步按钮**：步骤完成条件满足后激活
- **步骤完成条件**：
  - 步骤 0：无条件（阅读后直接下一步）
  - 步骤 1/2/5：`SurveyForm` 的 `canSubmit` 为 true
  - 步骤 3：校准完成（smileThreshold 已更新）
  - 步骤 4：所有 6 个条件的所有短语完成
- **完成全部流程**：步骤 5 提交后切回 mode `'setup'`

---

## StepNav 组件（`src/components/StepNav.tsx`）

```tsx
interface Props {
  steps: { label: string }[]
  currentStep: number
  completedSteps: Set<number>
  lockedSteps?: Set<number>
  onStepClick: (index: number) => void
}
```

- 已完成（`completedSteps`）：绿色 ✓，可点击
- 当前（`currentStep`）：高亮
- 锁定（`lockedSteps`）：灰色，不可点击
- 未到达：暗色，不可点击

SetupPage 和 FlowPage 复用同一个 StepNav，行为由 props 控制。

---

## localStorage 结构

所有 key 以参与者 ID 隔离：

| Key | 类型 | 内容 |
|---|---|---|
| `flow_step_{id}` | `number` | 当前步骤索引（用于恢复进度）|
| `step_personal_{id}` | `SurveyAnswers` JSON | 个人信息（age, gender, eyeTracker, eyeCondition）|
| `step_presurvey_{id}` | `SurveyAnswers` JSON | PANAS 实验前（20 项）|
| `step_postsurvey_{id}` | `SurveyAnswers` JSON | 结束问卷（TAM + PANAS-post + 排序）|
| `step_calibration_{id}` | `{ peak: number, threshold: number }` JSON | 微笑校准结果 |

实验按键事件继续写入 IndexedDB（不变）。

表单数据写入时机：`SurveyForm` 的每次 `onChange` 触发 `localStorage.setItem`（防抖 300ms）。

---

## 自定义 Hook：`useStepCache`

```ts
// src/hooks/useStepCache.ts
function useStepCache<T>(key: string, initial: T): [T, (val: T) => void]
```

- 读：初始化时从 localStorage 读取，fallback 到 `initial`
- 写：更新 state 并 debounce 300ms 后写入 localStorage

FlowPage 步骤 1/2/5 的 `SurveyForm` 通过此 hook 传入 `initialAnswers` 并在 `onChange` 时回写。

---

## 文件变更

| 操作 | 文件 | 说明 |
|---|---|---|
| 新建 | `src/pages/SetupPage.tsx` | 合并 DebugPage + ExperimenterConfigPage + 流程预览 |
| 新建 | `src/pages/FlowPage.tsx` | 6 步流程管理，含导航条和步骤切换 |
| 新建 | `src/components/StepNav.tsx` | 可复用步骤导航条 |
| 新建 | `src/hooks/useStepCache.ts` | localStorage 读写 hook |
| 修改 | `src/App.tsx` | 简化为 setup/flow 两状态 |
| 修改 | `src/components/SurveyForm.tsx` | 加入 `onChange` 回调（每题变化时通知外层）|
| 保留 | `src/pages/WelcomePage.tsx` | 步骤 0 复用 |
| 保留 | `src/pages/TutorialPage.tsx` | 步骤 3 复用 |
| 保留 | `src/pages/ExperimentPage.tsx` | 步骤 4 复用 |
| 保留 | `src/surveys/` | 所有 config 复用 |
| 删除 | `src/pages/ExperimenterConfigPage.tsx` | 逻辑折叠进 SetupPage |
| 删除 | `src/pages/PreSurveyPage.tsx` | 拆分为步骤 1/2，直接用 SurveyForm |
| 删除 | `src/pages/SurveyPage.tsx` | 逻辑折叠进 FlowPage 步骤 5 |
| 删除 | `src/pages/TypingTestPage.tsx` | 从流程移除 |
| 删除 | `src/types.ts` 中 AppPage | 替换为 `'setup' \| 'flow'` |
