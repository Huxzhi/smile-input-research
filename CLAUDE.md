# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Dev server (WSL2 — use --host to reach from Windows browser)
pnpm dev --host

# Type check
pnpm tsc --noEmit

# Run all tests
pnpm vitest run

# Run a single test file
pnpm vitest run tests/core/InputController.test.ts

# Run tests in watch mode
pnpm vitest

# Build
pnpm build
```

**Python bridge (must run on Windows, not WSL2):**
```bash
python bridge.py           # requires Tobii Eye Tracker 5 connected
python bridge.py --mock    # simulate gaze with mouse cursor
```

The bridge requires Windows because `tobii_research` SDK needs Windows USB drivers. The browser WebSocket client connects to `ws://localhost:7070`.

## Architecture

This is a browser-based HCI experiment system comparing three gaze-typing input methods (Dwell, Blink, Smile) across two keyboard layouts (QWERTY, OPTI).

### Data flow

```
Tobii SDK → bridge.py (Windows) → ws://localhost:7070
                                         │
                                    GazeLayer.ts
                                         │
MediaPipe Face Landmarker ──────► InputController.ts ──► ExperimentPage.tsx
(FaceDetector.ts, webcam)                │
                                    ExperimentEvent
                                         │
                                    DataStore.ts (IndexedDB)
                                         │
                                    ExportPage.tsx (CSV download)
```

### Core classes (`src/core/`)

- **`GazeLayer`** — WebSocket client. Emits normalized `{x, y, ts}` coords (0–1 fraction of screen). `toPixel()` converts to pixels for hit-testing.
- **`FaceDetector`** — MediaPipe wrapper. Runs detection on `requestAnimationFrame`, emits `FaceEvent` with `smileScore`, `blinkLeft`, `blinkRight` (all 0–1).
- **`InputController`** — All three input methods in one class, selected at construction time. Key methods: `gazeEnterKey(key, gaze)`, `gazeLeaveKey(key)`, `feedFace(face)`, `getDwellProgress(key)`. For smile input, position is locked 200ms after gaze enters a key (`SMILE_LOCK_MS`) to prevent face-movement gaze drift during confirmation.
- **`ExperimentManager`** — Latin square condition ordering derived from numeric participant ID: `pid % 2` determines first layout (odd→QWERTY, even→OPTI), `pid % 3` determines input method rotation order. Tracks phrase and char progress. **Important:** `recordInput()` only advances `charIndex`; caller must explicitly call `nextPhrase()` after `isPhraseComplete()` returns true.
- **`DataStore`** — IndexedDB via `idb` library. Three stores: `sessions`, `events` (autoIncrement), `surveys`. `exportCSV(sessionId)` returns `{sessions, events, surveys}` as CSV strings.

### Experiment flow (6 conditions)

`App.tsx` is a linear state machine: `welcome → device-check → tutorial → experiment → survey → export`

Each of 6 conditions = one layout × one input method. `ExperimentPage` reinitializes `InputController` on each `conditionIndex` change (via `useEffect` dep), runs a 60s rest screen between conditions (skippable after 30s), and saves one `ExperimentEvent` per keypress to DataStore.

### Keyboard gaze hit-testing

Keyboards report key `DOMRect`s via `onKeyRect(key, rect)` callback up to `ExperimentPage`, stored in a `keyRects` ref. Each gaze frame, pixel coordinates are compared against all rects. `prevHitKey` ref tracks the previously hit key to call `gazeLeaveKey` on departure and `gazeEnterKey` on entry — these are the triggers for dwell timers and smile lock timers.

### i18n

`src/i18n/index.tsx` (note: `.tsx`, contains JSX) provides `useI18n()` hook with `t(key, vars?)` for string lookup and `tArray(key)` for array lookup. Used for PANAS item arrays via `t('panas.items') as unknown as string[]`. Locale files: `src/i18n/{en,zh,ja}.json`.

### Testing

Tests are in `tests/core/`. They use Vitest + jsdom + `fake-indexeddb`. `GazeLayer`'s private `handleMessage` is accessed in tests via bracket notation (`layer['handleMessage'](...)`). All tests are unit tests against the core classes only — no component tests.

### Key constants (`src/types.ts`)

| Constant | Value | Purpose |
|---|---|---|
| `DWELL_MS` | 800ms | Hold duration to trigger dwell selection |
| `BLINK_MAX_MS` | 300ms | Max blink duration (longer = natural blink, ignored) |
| `BLINK_COOLDOWN_MS` | 500ms | Cooldown after blink fires |
| `SMILE_HOLD_MS` | 300ms | Hold smile duration to trigger selection |
| `SMILE_LOCK_MS` | 200ms | Gaze dwell before position locks for smile input |
