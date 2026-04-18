# Smile Input Research — Design Spec

**Date:** 2026-04-09  
**Domain:** HCI / Gaze-based Text Entry  
**Stack:** Vite + TypeScript (frontend), Python (Tobii bridge)

---

## 1. Research Overview

### Goal

Investigate how smile-based confirmation affects user experience in gaze-based text entry, compared to dwell and blink confirmation. Core hypothesis: smiling as an input action may improve emotional experience via the Facial Feedback Effect.

### Independent Variables

| Variable | Levels |
|----------|--------|
| Input method | Dwell / Blink / Smile |
| Keyboard layout | QWERTY / OPTI |

### Dependent Variables

- Text entry speed (characters per minute, derived from `actionTimestamp`)
- Accuracy (correct rate, from `isCorrect`)
- Subjective emotion (PANAS Positive Affect / Negative Affect scores)

### Related Work

- MacKenzie & Soukoreff phrase set for text entry evaluation
- "Text Entry by Gazing and Smiling" (Hindawi AHCI, 2013) — direct predecessor; differentiate by: comparing multiple confirmation modalities, using PANAS, and adding layout as a variable
- OPTI keyboard layout (optimized for single-pointer/gaze input, shown to outperform QWERTY with training)
- Facial Feedback Hypothesis (Strack et al.)
- Dwell-based gaze typing literature

---

## 2. System Architecture

**Principle:** Thin Python bridge (gaze data only) + all experiment logic in TypeScript browser app.

```
Hardware Layer
  Tobii Eye Tracker 5 ──→ bridge.py (tobii_research SDK)
                               └──→ WebSocket ws://localhost:7070
                                         └──→ GazeLayer (browser)

  1080p Camera ──→ getUserMedia() ──→ FaceDetector (MediaPipe, browser)

Browser (Vite + TypeScript)
  GazeLayer        — receives gaze coords, drives virtual cursor
  FaceDetector     — MediaPipe Face Landmarker, emits Smile / Blink events
  InputController  — fuses gaze + face signals, manages Dwell / Blink / Smile logic
  KeyboardRenderer — renders QWERTY or OPTI, shows dwell progress ring + gaze highlight
  ExperimentManager — condition ordering, phrase progression, timing, accuracy
  DataStore        — IndexedDB persistence
```

### Key Mechanism: Smile Position Lock

When gaze dwells on a key for ≥200ms, that key is locked as the target. When smile triggers, the locked position is used — not the current gaze position — preventing face-movement-induced gaze drift from causing wrong key selection.

---

## 3. Hardware & Setup

- **Eye tracker:** Tobii Eye Tracker 5 — calibration done in Tobii software before experiment; browser receives pre-calibrated gaze data
- **Camera:** 1080p webcam — face detection in browser via MediaPipe
- **Python bridge:** `tobii_research` SDK + `websockets`, broadcasts `{ x, y, ts }` at ~60Hz

```
# Usage
py bridge.py           # real hardware
py bridge.py --mock    # simulate gaze with mouse (for development)
```

---

## 4. Keyboard Layouts

### QWERTY
Standard layout. Familiar to participants. Used as the control condition.

### OPTI (Optimized Soft Keyboard Layout)
Mathematically optimized layout designed to minimize total gaze movement distance, based on Fitts' Law and English digraph probabilities.

Key design characteristics:
- **High-frequency letters centrally placed:** E, T, A, O, I, N, S, R, H concentrated at the center of the grid
- **Staggered (honeycomb) arrangement:** Keys offset like a brick wall to shorten diagonal movement distances, rather than strict grid alignment
- **Multiple space keys:** Space (highest-frequency key) distributed across multiple positions (left, right, bottom) so that reaching space after any letter is always short
- **Digraph optimization:** Frequently co-occurring letter pairs (TH, HE, IN, etc.) placed in close proximity; key positions computed from bigram probability weights

Both layouts:
- Full-screen display during experiment
- Equal key sizes within each layout
- Same visual feedback system (gaze highlight, dwell ring)

---

## 5. Input Methods

### Dwell (停留)
- Gaze on key triggers a circular progress ring around the key
- Ring fills over 800ms; completion = selection
- Ring resets if gaze leaves key before completion

### Blink (眨眼)
- Gaze highlights key; participant blinks to select
- Trigger: blink duration < 300ms (natural blink filter; longer = intentional close)
- Detected via MediaPipe `eyeBlinkLeft` + `eyeBlinkRight` blend shapes
- Debounce: 500ms cooldown after trigger to prevent double-fire

### Smile (微笑)
- Gaze locks key after ≥200ms dwell (position lock)
- Real-time smile score displayed on screen (0.0–1.0)
- Trigger: smile score ≥ personal threshold for ≥300ms
- Personal threshold = peak smile score from pre-experiment calibration × 0.8
- Detected via MediaPipe `mouthSmileLeft` + `mouthSmileRight` blend shapes (averaged)
- Position lock prevents gaze drift during smile facial movement

---

## 6. Experiment Design

### Structure

Within-subjects: each participant completes all 6 conditions.

**6 conditions = 2 layouts × 3 input methods**

### Condition Order (Counterbalancing)

**Layout order** — determined by participant ID parity:
- Odd → QWERTY first, then OPTI
- Even → OPTI first, then QWERTY

**Input method order within each layout** — systematic Latin square rotation by participant number:

| participantId mod 3 | Order |
|---------------------|-------|
| 1 | Dwell → Blink → Smile |
| 2 | Blink → Smile → Dwell |
| 0 | Smile → Dwell → Blink |

Both rules combined fully determine the 6-condition sequence from participant ID alone — no manual configuration needed. Order is generated at session start and stored in `sessions.conditionOrder`.

### Per-Condition Protocol

1. Condition introduction screen (layout + input method explanation)
2. Input task: 5 phrases from MacKenzie & Soukoreff phrase set (letter-by-letter)
3. Mandatory 60s rest (skippable after 30s)

### Phrase Set

MacKenzie & Soukoreff standard phrase set (English). Phrases are not translated — participants input English letters regardless of UI language. 5 phrases will be selected during implementation (varied length, representative character distribution). Same 5 phrases used across all 6 conditions with fixed order, to control for phrase difficulty variation.

---

## 7. Pre-Experiment Calibration (Smile)

Before the main experiment, a smile calibration step:

1. Prompt: "Please smile naturally" (shown in participant's language)
2. Sample smile score for 3 seconds
3. Record peak score → threshold = peak × 0.8
4. Stored in `sessions.smileCalibPeak` and `sessions.smileThreshold`

Purpose: accommodate individual facial muscle range differences (especially relevant for Japanese participants with more restrained expression norms).

---

## 8. Data Model (IndexedDB)

### `sessions`
```
id                  string              // UUID, referenced by events and surveys
participantId       string
language            'zh' | 'ja' | 'en'
conditionOrder      ConditionConfig[]   // [{layout, inputMethod}, ...]
smileCalibPeak      number
smileThreshold      number
startTime           number  // ms timestamp
endTime             number  // ms timestamp
```

### `events`
One record per confirmed letter input.
```
sessionId           string
conditionIndex      number              // 0–5
layout              'qwerty' | 'opti'
inputMethod         'dwell' | 'blink' | 'smile'
phraseIndex         number              // 0–4
targetChar          string              // expected letter
inputChar           string              // actual letter selected
isCorrect           boolean
gazeX               number              // gaze coords at moment of confirmation
gazeY               number
blinkLeft           number              // MediaPipe blink score at confirmation (0–1)
blinkRight          number
smileScore          number              // MediaPipe smile score at confirmation (0–1)
actionTimestamp     number              // ms timestamp
dwellDuration       number | null       // ms, only for dwell method
```

### `surveys`
```
sessionId           string
paScore             number              // PANAS Positive Affect (10–50)
naScore             number              // PANAS Negative Affect (10–50)
rawAnswers          number[20]          // individual item scores 1–5
submittedAt         number
```

### Export

Session end → one-click export → three CSV files (sessions, events, surveys).

---

## 9. Pages

| Page | Content |
|------|---------|
| **① Welcome** | Language selector (ZH/JA/EN), participant ID input |
| **② Device Check** | Camera permission status, Tobii WebSocket connection status; reminder to complete Tobii calibration in Tobii software first |
| **③ Tutorial** | Smile calibration (peak capture) → per-input-method demo + 3-letter practice; proceed when ready |
| **④ Experiment Loop** | Condition intro → 5-phrase input → rest screen (×6) |
| **⑤ PANAS Survey** | 20 affect items, 1–5 scale, in participant's language |
| **⑥ Export** | Summary stats + CSV download |

---

## 10. i18n

Three languages: Chinese (zh), Japanese (ja), English (en).  
Language selected on Welcome page; stored in session.

Translated content:
- All UI text (buttons, instructions, status messages)
- PANAS 20 affect words (standard validated translations for each language)
- Experiment instructions and condition descriptions
- Rest screen text

**Not translated:** phrase set (English only, for cross-condition comparability).

---

## 11. Project Structure

```
smile-input-research/
├── tobii-bridge/
│   ├── bridge.py
│   └── requirements.txt          # tobii_research, websockets
├── src/
│   ├── pages/
│   │   ├── WelcomePage.tsx
│   │   ├── DeviceCheckPage.tsx
│   │   ├── TutorialPage.tsx
│   │   ├── ExperimentPage.tsx
│   │   ├── SurveyPage.tsx
│   │   └── ExportPage.tsx
│   ├── components/
│   │   ├── keyboards/
│   │   │   ├── QwertyKeyboard.tsx
│   │   │   └── OptiKeyboard.tsx
│   │   ├── GazeLayer/
│   │   │   └── GazeLayer.tsx
│   │   └── DwellRing.tsx
│   ├── core/
│   │   ├── InputController.ts    # dwell timer, blink debounce, smile lock
│   │   ├── FaceDetector.ts       # MediaPipe wrapper, emits smile/blink events
│   │   ├── ExperimentManager.ts  # condition ordering, phrase progression
│   │   └── DataStore.ts          # IndexedDB, CSV export
│   ├── i18n/
│   │   ├── zh.json
│   │   ├── ja.json
│   │   └── en.json
│   ├── data/
│   │   └── phrases.ts            # MacKenzie & Soukoreff phrase set
│   └── main.tsx
├── docs/
│   └── superpowers/specs/
│       └── 2026-04-09-smile-input-design.md
├── index.html
├── vite.config.ts
└── package.json
```

---

## 12. Open Questions (Pre-Implementation)

- OPTI exact key coordinate map — need to source precise positions from original paper (Isokoski) or reconstruct from digraph probability matrix; staggered grid with multi-space keys
- Dwell time 800ms default — may need pilot study adjustment; consider making it configurable in a settings page
- Blink threshold 300ms — validate with MediaPipe blend shape response timing
- MediaPipe model: Face Landmarker (blend shapes) vs Face Mesh — Face Landmarker recommended for blend shape access
