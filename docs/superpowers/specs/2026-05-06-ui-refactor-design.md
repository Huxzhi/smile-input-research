# UI 重构设计文档

**日期：** 2026-05-06  
**范围：** FlowPage 整体布局重构，DebugDrawer 新组件，StepNav 扩展，数据流提升

---

## 目标

将当前分散的浮动调试面板、左侧条件侧边栏整合为统一的三区布局：
- **上**：步骤导航（含条件进度）
- **中**：内容区（表单 / 校准 / 键盘）
- **下**：调试面板（可折叠，全步骤可用）

---

## 第一节：整体布局结构

`FlowPage` 变为三区纵向 flex 布局，撑满 `100vh`：

```
FlowPage (height: 100vh, flex-direction: column)
├── StepNav          固定高度 ~50px（步骤4时扩展为双行 ~80px）
├── 内容区           flex: 1，overflow-y: auto
│   └── 当前步骤内容（WelcomePage / SurveyForm / TutorialPage / ExperimentPage）
└── DebugDrawer      折叠时 36px，展开时 ~220px
```

**删除项：**
- `ExperimentPage` 左侧条件侧边栏（`SIDEBAR_W = 130px`）
- 所有页面中的浮动 `FaceDebugPanel`
- `ExperimentPage` 顶部条件信息栏 + "跳过短语"/"跳过条件"按钮
- `ExperimentPage` 顶部实验者徽章（experimenter badge）

---

## 第二节：StepNav 扩展

### 主步骤行（不变）
6 个步骤：欢迎介绍 / 个人信息 / 实验前问卷 / 微笑校准 / 6条件实验 / 结束问卷

### 条件副行（步骤4专属）

当 `step === 4` 时，StepNav 下方展开副行，显示6个条件进度：

```
┌──────────────────────────────────────────────────────────┐
│  欢迎  ●  个人信息  ●  前问卷  ●  校准  ◉  实验  ●  后问卷 │
├──────────────────────────────────────────────────────────┤
│  ✓ QWERTY/凝视  ✓ QWERTY/眨眼  ◉ QWERTY/微笑  ○ …      │
└──────────────────────────────────────────────────────────┘
```

**StepNav 新增 props：**
```ts
subSteps?: { label: string; done: boolean; active: boolean }[]
```

**数据来源：**`FlowPage` 通过 `onConditionChange` 回调从 `ExperimentPage` 拿到 `conditionIndex`，构建 `subSteps` 传给 `StepNav`。

---

## 第三节：DebugDrawer 组件

新建 `src/components/DebugDrawer.tsx`，固定在 `FlowPage` 底部。

### 折叠状态（36px）
```
┌─────────────────────────────────────────────────────┐
│  🎥 调试面板   😊 42%  👁 open              [▲ 展开] │
└─────────────────────────────────────────────────────┘
```
摘要行显示当前 smileScore% 和眼睛状态，便于实验者快速监控。

### 展开状态（~220px）
```
┌─────────────────────────────────────────────────────┐
│  摄像头画面  │  😊 口角  ████░░  68%               │
│  (240×180)  │  ✨ 眼角  ███░░░  45%               │
│             │  综合     52%                        │
│             │  👁眨左   22%  👁眨右  19%           │
│                                          [▼ 收起]  │
└─────────────────────────────────────────────────────┘
```

**Props：**
```ts
interface DebugDrawerProps {
  open: boolean
  onToggle: () => void
  videoRef: React.RefObject<HTMLVideoElement>
  faceEvent: FaceEvent | null
  gaze: GazePoint | null
}
```

**状态持久化：** `open` 状态通过 localStorage 保存（key: `debug_drawer_open`），刷新后恢复。

**无摄像头时：** 显示「等待摄像头…」占位文字，不报错。

---

## 第四节：数据流提升

### 当前
`videoRef`、`useGazeInput`（含 `faceEvent`、`gaze`）各自在 `TutorialPage` 和 `ExperimentPage` 内部管理。

### 重构后

`useGazeInput` 拆分为两层：

**层1：`useInputSource`（提升到 FlowPage）**  
负责设备连接（Tobii WebSocket / 鼠标模拟）和摄像头人脸检测，输出原始 `gaze` 和 `faceEvent`。不感知控制器或键位。

**层2：`useGazeHitTest`（保留在 ExperimentPage）**  
接收 `gaze`，管理 `keyRects`，对比命中键位，调用 `controllerRef.gazeEnterKey/LeaveKey`。

```
FlowPage
├── videoRef（始终挂载，<video style="display:none" />）
├── useInputSource({ gazeMode, offsetX, offsetY, videoRef })
│   ├── faceEvent  → DebugDrawer + TutorialPage + ExperimentPage
│   └── gaze       → TutorialPage + ExperimentPage
│
├── TutorialPage   新增 props: videoRef, gaze, faceEvent
│   （删除内部 useGazeInput、video 元素、FaceDebugPanel）
│
└── ExperimentPage 新增 props: gaze, faceEvent
    内部保留 useGazeHitTest（keyRects + controllerRef 命中检测）
    （删除内部 useGazeInput、video 元素、FaceDebugPanel、侧边栏）
```

**`conditionIndex` 回传：**  
`ExperimentPage` 接收 `onConditionChange: (index: number) => void`，在条件切换时调用，`FlowPage` 用于更新 StepNav 副行。

---

## 受影响的文件

| 文件 | 变更类型 |
|------|---------|
| `src/pages/FlowPage.tsx` | 大改：提升数据流，加 DebugDrawer，管理 conditionIndex |
| `src/components/StepNav.tsx` | 扩展：支持 subSteps 副行 |
| `src/components/DebugDrawer.tsx` | 新建 |
| `src/pages/ExperimentPage.tsx` | 大改：删除侧边栏、FaceDebugPanel、跳过按钮；接收新 props |
| `src/pages/TutorialPage.tsx` | 中改：删除 useGazeInput、FaceDebugPanel；接收新 props |
| `src/components/FaceDebugPanel.tsx` | 小改：可能去掉浮动模式，只保留 embedded 模式 |

---

## 不在本次范围内

- SetupPage / DebugPage 的布局（保持不变）
- 实验数据逻辑、DataStore、ExperimentManager
- 国际化（i18n）内容
