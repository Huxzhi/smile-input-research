# Experimenter Config Page Design

**Date:** 2026-04-23  
**Status:** Approved

## Overview

Add a dedicated experimenter configuration page between the debug page and the welcome page. The experimenter uses this page to set up all experiment parameters before handing the screen to the participant.

New flow:
```
debug → experimenter-config → welcome → typing-test → tutorial → experiment → survey → export
```

## Data Structures

### New: `ExperimenterConfig`

```ts
interface ExperimenterConfig {
  experimenterName: string          // stored in session + shown in UI
  conditionOrder: ConditionConfig[] // 6 conditions, manually reorderable
  startConditionIndex: number       // 0-based, which condition to start from
  startPhraseIndex: number          // 0-based, which phrase within that condition
  phrasesPerCondition: number       // global, all conditions use same count, default 15
}
```

### Extended: `SessionState`

Add two fields:

```ts
experimenterName: string
experimenterConfig: ExperimenterConfig
```

`experimenterName` is written to the `sessions` table in DataStore and included in CSV export.

### Moved: Participant ID

Participant ID input moves from `WelcomePage` to `ExperimenterConfigPage`. The welcome page retains only language selection and welcome text. `SessionState.participantId` is set from the config page.

## Page Layout

### Block 1 — Basic Info (two rows)

| Field | Details |
|-------|---------|
| 实验者姓名 | Text input, required |
| 参与者 ID | Text input, required; drives Latin square recommendation |
| 每条件语句数 | Number input, default 15, range 1–30 |
| 使用拉丁方推荐顺序 | Button; computes condition order from participant ID using existing Latin square logic and populates the table |

### Block 2 — Condition Order Table

Six rows. Each row shows:

```
[↑][↓]  #  Layout   Method   [起始语句: N]
```

- **↑ / ↓ buttons** reorder conditions (swap adjacent rows)
- **Row click / ▶ marker** sets that row as the starting condition; reveals a phrase-index input (range 1 – phrasesPerCondition, default 1)
- Only one row can be the starting condition at a time
- Layout labels are color-coded: QWERTY = blue, OPTI = orange
- Method labels are color-coded: Dwell / Blink / Smile each have a distinct color
- "使用拉丁方推荐顺序" resets to the auto-generated order but does NOT override subsequent manual changes

### Block 3 — Bottom Action Bar

```
[← 返回调试]                         [开始实验 →]
```

"开始实验" is disabled when experimenterName or participantId is empty.

## ExperimentManager Changes

```ts
constructor(participantId: string, config?: ExperimenterConfig)
```

- With `config`: use `config.conditionOrder` and `config.phrasesPerCondition` directly
- Without `config`: fall back to existing Latin square logic (backward-compatible; existing tests unaffected)
- `ExperimentPage` calls `manager.startCondition(startConditionIndex, startPhraseIndex)` on initialization

`PHRASES_PER_CONDITION` constant in `types.ts` becomes the default value only; runtime value comes from `config.phrasesPerCondition`.

## Experiment UI Badge

`ExperimentPage` shows a small badge in the top-right corner:

```
实验者: 张三  |  P05  |  条件 2/6
```

## Welcome Page Changes

- Remove participant ID input field and its validation
- Remove `onNext(session)` signature; change to `onNext(language: Language)`
- Keep: language switcher buttons, welcome title, start button

## DataStore / CSV Export

- `sessions` table: add `experimenterName` column
- `exportCSV` includes `experimenterName` in the sessions CSV

## Constraints

- The Latin square recommendation is purely a convenience; the experimenter can freely reorder after applying it
- `phrasesPerCondition` applies uniformly across all conditions (no per-condition override)
- Starting phrase index (1-based in UI, 0-based internally) is only meaningful for the starting condition; all other conditions always start from phrase 0
