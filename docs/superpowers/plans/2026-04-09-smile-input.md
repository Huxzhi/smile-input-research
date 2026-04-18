# Smile Input Research — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser-based gaze typing experiment system supporting Dwell/Blink/Smile input methods across QWERTY and OPTI keyboard layouts, with IndexedDB data recording and PANAS survey.

**Architecture:** Thin Python bridge streams Tobii gaze data via WebSocket; all experiment logic lives in TypeScript. MediaPipe Face Landmarker runs in-browser for smile/blink detection. Linear page state machine drives the experiment flow.

**Tech Stack:** Vite 5, React 18, TypeScript 5, Vitest, @mediapipe/tasks-vision, idb (IndexedDB wrapper), Python 3 + tobii_research + websockets

---

## File Map

```
tobii-bridge/
  bridge.py               # Tobii SDK → WebSocket broadcast
  requirements.txt

src/
  types.ts                # All shared types and constants
  data/phrases.ts         # 5 MacKenzie & Soukoreff phrases
  i18n/
    index.ts              # useI18n hook + LanguageContext
    zh.json
    ja.json
    en.json
  core/
    GazeLayer.ts          # WebSocket client → normalized gaze coords
    FaceDetector.ts       # MediaPipe wrapper → FaceEvent stream
    InputController.ts    # Dwell/Blink/Smile logic + position lock
    ExperimentManager.ts  # Condition ordering, phrase progression
    DataStore.ts          # IndexedDB read/write + CSV export
  components/
    GazeCursor.tsx        # Gaze point visual overlay
    DwellRing.tsx         # SVG progress ring around key
    keyboards/
      KeyboardKey.tsx     # Single key: highlight + dwell ring
      QwertyKeyboard.tsx
      OptiKeyboard.tsx
  pages/
    WelcomePage.tsx
    DeviceCheckPage.tsx
    TutorialPage.tsx      # Smile calibration + per-method practice
    ExperimentPage.tsx    # Main experiment loop
    SurveyPage.tsx        # PANAS 20-item questionnaire
    ExportPage.tsx        # Summary + CSV download
  App.tsx                 # Page state machine
  main.tsx

tests/
  core/
    InputController.test.ts
    ExperimentManager.test.ts
    DataStore.test.ts
```

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/App.tsx`

- [ ] **Step 1: Scaffold Vite project**

```bash
npm create vite@latest . -- --template react-ts
npm install
```

- [ ] **Step 2: Install dependencies**

```bash
npm install @mediapipe/tasks-vision idb
npm install -D vitest @vitest/ui jsdom @testing-library/react @testing-library/jest-dom
```

- [ ] **Step 3: Configure Vitest in `vite.config.ts`**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
  },
})
```

- [ ] **Step 4: Create `tests/setup.ts`**

```typescript
import '@testing-library/jest-dom'
```

- [ ] **Step 5: Verify scaffold runs**

```bash
npm run dev
```
Expected: Vite dev server starts on http://localhost:5173

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: scaffold Vite + React + TypeScript project"
```

---

## Task 2: Shared Types

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: Write `src/types.ts`**

```typescript
export type Layout = 'qwerty' | 'opti'
export type InputMethod = 'dwell' | 'blink' | 'smile'
export type Language = 'zh' | 'ja' | 'en'
export type AppPage =
  | 'welcome'
  | 'device-check'
  | 'tutorial'
  | 'experiment'
  | 'survey'
  | 'export'

export interface ConditionConfig {
  layout: Layout
  inputMethod: InputMethod
}

export interface GazePoint {
  x: number   // normalized 0–1 (fraction of screen width)
  y: number   // normalized 0–1 (fraction of screen height)
  ts: number  // unix ms
}

export interface FaceEvent {
  smileScore: number    // 0–1, average of mouthSmileLeft + mouthSmileRight
  blinkLeft: number     // 0–1
  blinkRight: number    // 0–1
  ts: number
}

export interface KeyInfo {
  key: string           // letter, or 'SPACE', 'BACKSPACE'
  rect: DOMRect         // bounding box in viewport px
}

export interface InputFiredEvent {
  key: string
  gazeX: number
  gazeY: number
  blinkLeft: number
  blinkRight: number
  smileScore: number
  dwellDuration: number | null
  ts: number
}

export interface Session {
  id: string
  participantId: string
  language: Language
  conditionOrder: ConditionConfig[]
  smileCalibPeak: number
  smileThreshold: number
  startTime: number
  endTime: number
}

export interface ExperimentEvent {
  sessionId: string
  conditionIndex: number
  layout: Layout
  inputMethod: InputMethod
  phraseIndex: number
  targetChar: string
  inputChar: string
  isCorrect: boolean
  gazeX: number
  gazeY: number
  blinkLeft: number
  blinkRight: number
  smileScore: number
  actionTimestamp: number
  dwellDuration: number | null
}

export interface SurveyResult {
  sessionId: string
  paScore: number         // sum of 10 PA items, range 10–50
  naScore: number         // sum of 10 NA items, range 10–50
  rawAnswers: number[]    // 20 items, 1–5 each
  submittedAt: number
}

// Dwell time in ms
export const DWELL_MS = 800
// Blink max duration in ms (longer = natural blink, ignore)
export const BLINK_MAX_MS = 300
// Blink cooldown in ms
export const BLINK_COOLDOWN_MS = 500
// Smile trigger duration in ms
export const SMILE_HOLD_MS = 300
// Smile position lock dwell in ms
export const SMILE_LOCK_MS = 200
```

- [ ] **Step 2: Commit**

```bash
git add src/types.ts
git commit -m "feat: add shared types and constants"
```

---

## Task 3: Tobii Bridge (Python)

**Files:**
- Create: `tobii-bridge/bridge.py`, `tobii-bridge/requirements.txt`

- [ ] **Step 1: Create `tobii-bridge/requirements.txt`**

```
tobii_research
websockets
```

- [ ] **Step 2: Create `tobii-bridge/bridge.py`**

```python
"""
bridge.py — Tobii Eye Tracker 5 → WebSocket broadcaster
Broadcasts { x, y, ts } over ws://localhost:7070 at ~60Hz.

Usage:
  py bridge.py           # real hardware
  py bridge.py --mock    # simulate gaze with mouse position
"""
import asyncio
import json
import sys
import time
import threading
import websockets
from websockets.server import serve

PORT = 7070
clients: set = set()
latest_gaze = {"x": 0.5, "y": 0.5, "ts": 0}

async def handler(websocket):
    clients.add(websocket)
    try:
        await websocket.wait_closed()
    finally:
        clients.discard(websocket)

async def broadcast_loop():
    while True:
        if clients:
            msg = json.dumps(latest_gaze)
            await asyncio.gather(
                *[c.send(msg) for c in list(clients)],
                return_exceptions=True
            )
        await asyncio.sleep(1 / 60)

def start_tobii():
    import tobii_research as tr
    trackers = tr.find_all_eyetrackers()
    if not trackers:
        print("No Tobii tracker found. Run with --mock for simulation.")
        sys.exit(1)
    tracker = trackers[0]
    print(f"Connected: {tracker.model}")

    def gaze_callback(gaze_data):
        left = gaze_data["left_gaze_point_on_display_area"]
        right = gaze_data["right_gaze_point_on_display_area"]
        x = (left[0] + right[0]) / 2
        y = (left[1] + right[1]) / 2
        latest_gaze.update({"x": round(x, 4), "y": round(y, 4), "ts": int(time.time() * 1000)})

    tracker.subscribe_to(tr.EYETRACKER_GAZE_DATA, gaze_callback, as_dictionary=True)

def start_mock():
    """Update latest_gaze from mouse position (cross-platform)."""
    try:
        import ctypes
        def _win_mouse():
            class POINT(ctypes.Structure):
                _fields_ = [("x", ctypes.c_long), ("y", ctypes.c_long)]
            while True:
                pt = POINT()
                ctypes.windll.user32.GetCursorPos(ctypes.byref(pt))
                sw = ctypes.windll.user32.GetSystemMetrics(0)
                sh = ctypes.windll.user32.GetSystemMetrics(1)
                latest_gaze.update({
                    "x": round(pt.x / sw, 4),
                    "y": round(pt.y / sh, 4),
                    "ts": int(time.time() * 1000)
                })
                time.sleep(1 / 60)
        threading.Thread(target=_win_mouse, daemon=True).start()
    except Exception:
        print("Mock mode: mouse tracking unavailable, using static center (0.5, 0.5)")

async def main():
    mock = "--mock" in sys.argv
    if mock:
        start_mock()
        print("Mock mode: tracking mouse position")
    else:
        start_tobii()

    print(f"WebSocket server on ws://localhost:{PORT}")
    async with serve(handler, "localhost", PORT):
        await broadcast_loop()

if __name__ == "__main__":
    asyncio.run(main())
```

- [ ] **Step 3: Verify bridge starts**

```bash
cd tobii-bridge
pip install -r requirements.txt
py bridge.py --mock
```
Expected output: `Mock mode: tracking mouse position` and `WebSocket server on ws://localhost:7070`

- [ ] **Step 4: Commit**

```bash
git add tobii-bridge/
git commit -m "feat: add Tobii WebSocket bridge with mock mode"
```

---

## Task 4: GazeLayer

**Files:**
- Create: `src/core/GazeLayer.ts`, `tests/core/GazeLayer.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/core/GazeLayer.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GazeLayer } from '../../src/core/GazeLayer'

describe('GazeLayer', () => {
  it('normalizes gaze coords from WebSocket message', () => {
    const layer = new GazeLayer('ws://localhost:7070')
    const points: { x: number; y: number }[] = []
    layer.onGaze((p) => points.push(p))

    // Simulate receiving a message
    layer['handleMessage']({ x: 0.3, y: 0.7, ts: 1000 })
    expect(points).toHaveLength(1)
    expect(points[0]).toEqual({ x: 0.3, y: 0.7, ts: 1000 })
  })

  it('converts normalized coords to pixel position', () => {
    const layer = new GazeLayer('ws://localhost:7070')
    const px = layer.toPixel({ x: 0.5, y: 0.5, ts: 0 }, 1920, 1080)
    expect(px).toEqual({ x: 960, y: 540 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/core/GazeLayer.test.ts
```
Expected: FAIL — `GazeLayer` not found

- [ ] **Step 3: Implement `src/core/GazeLayer.ts`**

```typescript
import type { GazePoint } from '../types'

type GazeCallback = (point: GazePoint) => void

export class GazeLayer {
  private ws: WebSocket | null = null
  private callbacks: GazeCallback[] = []

  constructor(private url: string) {}

  connect() {
    this.ws = new WebSocket(this.url)
    this.ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as GazePoint
        this.handleMessage(data)
      } catch {}
    }
  }

  disconnect() {
    this.ws?.close()
    this.ws = null
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  onGaze(cb: GazeCallback) {
    this.callbacks.push(cb)
    return () => { this.callbacks = this.callbacks.filter(c => c !== cb) }
  }

  private handleMessage(data: GazePoint) {
    for (const cb of this.callbacks) cb(data)
  }

  toPixel(point: GazePoint, screenW: number, screenH: number) {
    return { x: Math.round(point.x * screenW), y: Math.round(point.y * screenH) }
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
npx vitest run tests/core/GazeLayer.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/GazeLayer.ts tests/core/GazeLayer.test.ts
git commit -m "feat: add GazeLayer WebSocket client"
```

---

## Task 5: FaceDetector

**Files:**
- Create: `src/core/FaceDetector.ts`

Note: MediaPipe runs only in browser with a real video stream; unit tests are skipped. Manual verification in DeviceCheck page (Task 14).

- [ ] **Step 1: Create `src/core/FaceDetector.ts`**

```typescript
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import type { FaceEvent } from '../types'

type FaceCallback = (event: FaceEvent) => void

export class FaceDetector {
  private landmarker: FaceLandmarker | null = null
  private callbacks: FaceCallback[] = []
  private animFrame: number | null = null

  async init() {
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm'
    )
    this.landmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
        delegate: 'GPU',
      },
      outputFaceBlendshapes: true,
      runningMode: 'VIDEO',
      numFaces: 1,
    })
  }

  start(video: HTMLVideoElement) {
    const detect = () => {
      if (!this.landmarker || video.readyState < 2) {
        this.animFrame = requestAnimationFrame(detect)
        return
      }
      const result = this.landmarker.detectForVideo(video, performance.now())
      if (result.faceBlendshapes?.[0]) {
        const shapes = result.faceBlendshapes[0].categories
        const get = (name: string) =>
          shapes.find(s => s.categoryName === name)?.score ?? 0
        const event: FaceEvent = {
          smileScore: (get('mouthSmileLeft') + get('mouthSmileRight')) / 2,
          blinkLeft: get('eyeBlinkLeft'),
          blinkRight: get('eyeBlinkRight'),
          ts: Date.now(),
        }
        for (const cb of this.callbacks) cb(event)
      }
      this.animFrame = requestAnimationFrame(detect)
    }
    this.animFrame = requestAnimationFrame(detect)
  }

  stop() {
    if (this.animFrame !== null) cancelAnimationFrame(this.animFrame)
  }

  onFace(cb: FaceCallback) {
    this.callbacks.push(cb)
    return () => { this.callbacks = this.callbacks.filter(c => c !== cb) }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/core/FaceDetector.ts
git commit -m "feat: add FaceDetector with MediaPipe Face Landmarker"
```

---

## Task 6: InputController

**Files:**
- Create: `src/core/InputController.ts`, `tests/core/InputController.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/core/InputController.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { InputController } from '../../src/core/InputController'
import { DWELL_MS, BLINK_MAX_MS, BLINK_COOLDOWN_MS, SMILE_HOLD_MS, SMILE_LOCK_MS } from '../../src/types'

describe('InputController — Dwell', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('fires after DWELL_MS on same key', () => {
    const ctrl = new InputController('dwell')
    const fired: string[] = []
    ctrl.onInput((e) => fired.push(e.key))

    ctrl.gazeEnterKey('A', { x: 0.5, y: 0.5, ts: 0 })
    vi.advanceTimersByTime(DWELL_MS - 1)
    expect(fired).toHaveLength(0)
    vi.advanceTimersByTime(1)
    expect(fired).toEqual(['A'])
  })

  it('cancels if gaze leaves before DWELL_MS', () => {
    const ctrl = new InputController('dwell')
    const fired: string[] = []
    ctrl.onInput((e) => fired.push(e.key))

    ctrl.gazeEnterKey('A', { x: 0.5, y: 0.5, ts: 0 })
    vi.advanceTimersByTime(DWELL_MS - 100)
    ctrl.gazeLeaveKey('A')
    vi.advanceTimersByTime(200)
    expect(fired).toHaveLength(0)
  })
})

describe('InputController — Blink', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('fires on blink under BLINK_MAX_MS while key focused', () => {
    const ctrl = new InputController('blink')
    const fired: string[] = []
    ctrl.onInput((e) => fired.push(e.key))
    ctrl.setFocusedKey('B', { x: 0.3, y: 0.4, ts: 0 })

    ctrl.feedFace({ smileScore: 0, blinkLeft: 0.9, blinkRight: 0.9, ts: 100 })
    vi.advanceTimersByTime(150)
    ctrl.feedFace({ smileScore: 0, blinkLeft: 0.1, blinkRight: 0.1, ts: 250 })
    expect(fired).toEqual(['B'])
  })

  it('ignores blink over BLINK_MAX_MS (natural blink)', () => {
    const ctrl = new InputController('blink')
    const fired: string[] = []
    ctrl.onInput((e) => fired.push(e.key))
    ctrl.setFocusedKey('B', { x: 0.3, y: 0.4, ts: 0 })

    ctrl.feedFace({ smileScore: 0, blinkLeft: 0.9, blinkRight: 0.9, ts: 100 })
    vi.advanceTimersByTime(BLINK_MAX_MS + 50)
    ctrl.feedFace({ smileScore: 0, blinkLeft: 0.1, blinkRight: 0.1, ts: 100 + BLINK_MAX_MS + 50 })
    expect(fired).toHaveLength(0)
  })
})

describe('InputController — Smile', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('fires after SMILE_HOLD_MS above threshold, using locked position', () => {
    const ctrl = new InputController('smile', 0.6)
    const fired: Array<{ key: string; gazeX: number }> = []
    ctrl.onInput((e) => fired.push({ key: e.key, gazeX: e.gazeX }))

    // Lock key position after SMILE_LOCK_MS dwell
    ctrl.gazeEnterKey('C', { x: 0.4, y: 0.5, ts: 0 })
    vi.advanceTimersByTime(SMILE_LOCK_MS)

    // Gaze drifts but lock stays on C at x=0.4
    ctrl.setGaze({ x: 0.8, y: 0.8, ts: SMILE_LOCK_MS })

    // Smile above threshold for SMILE_HOLD_MS
    ctrl.feedFace({ smileScore: 0.75, blinkLeft: 0, blinkRight: 0, ts: SMILE_LOCK_MS })
    vi.advanceTimersByTime(SMILE_HOLD_MS)
    ctrl.feedFace({ smileScore: 0.75, blinkLeft: 0, blinkRight: 0, ts: SMILE_LOCK_MS + SMILE_HOLD_MS })

    expect(fired).toHaveLength(1)
    expect(fired[0].key).toBe('C')
    expect(fired[0].gazeX).toBe(0.4)  // locked position, not drifted 0.8
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/core/InputController.test.ts
```
Expected: FAIL

- [ ] **Step 3: Implement `src/core/InputController.ts`**

```typescript
import type { GazePoint, FaceEvent, InputFiredEvent, InputMethod } from '../types'
import { DWELL_MS, BLINK_MAX_MS, BLINK_COOLDOWN_MS, SMILE_HOLD_MS, SMILE_LOCK_MS } from '../types'

type InputCallback = (event: InputFiredEvent) => void

export class InputController {
  private callbacks: InputCallback[] = []
  private focusedKey: string | null = null
  private focusedGaze: GazePoint | null = null
  private lockedKey: string | null = null
  private lockedGaze: GazePoint | null = null
  private currentGaze: GazePoint | null = null
  private lastFace: FaceEvent | null = null

  // Dwell
  private dwellTimer: ReturnType<typeof setTimeout> | null = null
  private dwellStart: number = 0

  // Blink
  private blinkStart: number | null = null
  private blinkCooldownUntil: number = 0

  // Smile
  private smileStart: number | null = null
  private smileLockTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private method: InputMethod,
    private smileThreshold: number = 0.6
  ) {}

  onInput(cb: InputCallback) {
    this.callbacks.push(cb)
    return () => { this.callbacks = this.callbacks.filter(c => c !== cb) }
  }

  setGaze(g: GazePoint) {
    this.currentGaze = g
  }

  setFocusedKey(key: string, gaze: GazePoint) {
    this.focusedKey = key
    this.focusedGaze = gaze
  }

  gazeEnterKey(key: string, gaze: GazePoint) {
    this.focusedKey = key
    this.focusedGaze = gaze
    this.currentGaze = gaze

    if (this.method === 'dwell') {
      this.dwellStart = Date.now()
      this.dwellTimer = setTimeout(() => {
        this.fire(key, gaze, Date.now() - this.dwellStart)
      }, DWELL_MS)
    }

    if (this.method === 'smile') {
      // Start lock timer
      this.smileLockTimer = setTimeout(() => {
        this.lockedKey = key
        this.lockedGaze = gaze
      }, SMILE_LOCK_MS)
    }
  }

  gazeLeaveKey(key: string) {
    if (this.focusedKey === key) {
      this.focusedKey = null
      this.focusedGaze = null
    }
    if (this.method === 'dwell' && this.dwellTimer) {
      clearTimeout(this.dwellTimer)
      this.dwellTimer = null
    }
    if (this.method === 'smile') {
      if (this.smileLockTimer) clearTimeout(this.smileLockTimer)
      // Only clear lock if leaving the locked key
      if (this.lockedKey === key) {
        this.lockedKey = null
        this.lockedGaze = null
        this.smileStart = null
      }
    }
  }

  feedFace(face: FaceEvent) {
    this.lastFace = face
    const now = Date.now()

    if (this.method === 'blink') {
      const blinking = (face.blinkLeft + face.blinkRight) / 2 > 0.6

      if (blinking && this.blinkStart === null && now >= this.blinkCooldownUntil) {
        this.blinkStart = now
      } else if (!blinking && this.blinkStart !== null) {
        const dur = now - this.blinkStart
        if (dur < BLINK_MAX_MS && this.focusedKey && this.focusedGaze) {
          this.blinkCooldownUntil = now + BLINK_COOLDOWN_MS
          this.fire(this.focusedKey, this.focusedGaze, null)
        }
        this.blinkStart = null
      }
    }

    if (this.method === 'smile') {
      const smiling = face.smileScore >= this.smileThreshold

      if (smiling && this.lockedKey && this.lockedGaze) {
        if (this.smileStart === null) {
          this.smileStart = now
        } else if (now - this.smileStart >= SMILE_HOLD_MS) {
          const key = this.lockedKey
          const gaze = this.lockedGaze
          this.smileStart = null
          this.lockedKey = null
          this.lockedGaze = null
          this.fire(key, gaze, null)
        }
      } else if (!smiling) {
        this.smileStart = null
      }
    }
  }

  getDwellProgress(key: string): number {
    if (this.method !== 'dwell' || this.focusedKey !== key || !this.dwellTimer) return 0
    return Math.min((Date.now() - this.dwellStart) / DWELL_MS, 1)
  }

  getSmileScore(): number {
    return this.lastFace?.smileScore ?? 0
  }

  getLockedKey(): string | null {
    return this.lockedKey
  }

  private fire(key: string, gaze: GazePoint, dwellDuration: number | null) {
    const face = this.lastFace
    const event: InputFiredEvent = {
      key,
      gazeX: gaze.x,
      gazeY: gaze.y,
      blinkLeft: face?.blinkLeft ?? 0,
      blinkRight: face?.blinkRight ?? 0,
      smileScore: face?.smileScore ?? 0,
      dwellDuration,
      ts: Date.now(),
    }
    for (const cb of this.callbacks) cb(event)
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
npx vitest run tests/core/InputController.test.ts
```
Expected: PASS (all 5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/core/InputController.ts tests/core/InputController.test.ts
git commit -m "feat: add InputController with Dwell, Blink, Smile logic"
```

---

## Task 7: ExperimentManager

**Files:**
- Create: `src/core/ExperimentManager.ts`, `src/data/phrases.ts`, `tests/core/ExperimentManager.test.ts`

- [ ] **Step 1: Create `src/data/phrases.ts`**

```typescript
// 5 phrases selected from MacKenzie & Soukoreff (2003) phrase set.
// Verify against published set before final experiment.
export const PHRASES: string[] = [
  "take a look at that",
  "how are you doing",
  "we went to the store",
  "a small number of people",
  "the bus is late today",
]
```

- [ ] **Step 2: Write failing tests**

```typescript
// tests/core/ExperimentManager.test.ts
import { describe, it, expect } from 'vitest'
import { ExperimentManager } from '../../src/core/ExperimentManager'

describe('ExperimentManager — condition ordering', () => {
  it('odd participant ID starts with QWERTY', () => {
    const mgr = new ExperimentManager('1')
    expect(mgr.getConditionOrder()[0].layout).toBe('qwerty')
    expect(mgr.getConditionOrder()[3].layout).toBe('opti')
  })

  it('even participant ID starts with OPTI', () => {
    const mgr = new ExperimentManager('2')
    expect(mgr.getConditionOrder()[0].layout).toBe('opti')
    expect(mgr.getConditionOrder()[3].layout).toBe('qwerty')
  })

  it('input method order rotates by participantId mod 3 — mod 1', () => {
    const mgr = new ExperimentManager('1') // 1 mod 3 = 1 → dwell,blink,smile
    const methods = mgr.getConditionOrder().slice(0, 3).map(c => c.inputMethod)
    expect(methods).toEqual(['dwell', 'blink', 'smile'])
  })

  it('input method order rotates by participantId mod 3 — mod 2', () => {
    const mgr = new ExperimentManager('2') // 2 mod 3 = 2 → blink,smile,dwell
    const methods = mgr.getConditionOrder().slice(0, 3).map(c => c.inputMethod)
    expect(methods).toEqual(['blink', 'smile', 'dwell'])
  })

  it('input method order rotates by participantId mod 3 — mod 0', () => {
    const mgr = new ExperimentManager('3') // 3 mod 3 = 0 → smile,dwell,blink
    const methods = mgr.getConditionOrder().slice(0, 3).map(c => c.inputMethod)
    expect(methods).toEqual(['smile', 'dwell', 'blink'])
  })
})

describe('ExperimentManager — phrase progression', () => {
  it('returns correct target char', () => {
    const mgr = new ExperimentManager('1')
    mgr.startCondition(0)
    // phrase 0 = "take a look at that", first char = 't'
    expect(mgr.getTargetChar()).toBe('t')
  })

  it('advances to next char on input', () => {
    const mgr = new ExperimentManager('1')
    mgr.startCondition(0)
    mgr.recordInput('t')
    expect(mgr.getTargetChar()).toBe('a')
  })

  it('detects phrase complete', () => {
    const mgr = new ExperimentManager('1')
    mgr.startCondition(0)
    const phrase = 'take a look at that'
    for (const ch of phrase) mgr.recordInput(ch)
    expect(mgr.isPhraseComplete()).toBe(true)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx vitest run tests/core/ExperimentManager.test.ts
```
Expected: FAIL

- [ ] **Step 4: Implement `src/core/ExperimentManager.ts`**

```typescript
import type { ConditionConfig, InputMethod, Layout } from '../types'
import { PHRASES } from '../data/phrases'

const METHOD_ORDERS: InputMethod[][] = [
  ['smile', 'dwell', 'blink'],  // mod 0
  ['dwell', 'blink', 'smile'],  // mod 1
  ['blink', 'smile', 'dwell'],  // mod 2
]

export class ExperimentManager {
  private conditionOrder: ConditionConfig[]
  private conditionIndex = 0
  private phraseIndex = 0
  private charIndex = 0
  private inputHistory: Array<{ targetChar: string; inputChar: string; isCorrect: boolean }> = []

  constructor(private participantId: string) {
    this.conditionOrder = this.buildConditionOrder(participantId)
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

  getConditionOrder(): ConditionConfig[] {
    return this.conditionOrder
  }

  getCurrentCondition(): ConditionConfig {
    return this.conditionOrder[this.conditionIndex]
  }

  getConditionIndex(): number {
    return this.conditionIndex
  }

  startCondition(index: number) {
    this.conditionIndex = index
    this.phraseIndex = 0
    this.charIndex = 0
    this.inputHistory = []
  }

  getCurrentPhrase(): string {
    return PHRASES[this.phraseIndex]
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
    return this.phraseIndex >= PHRASES.length
  }

  isExperimentComplete(): boolean {
    return this.conditionIndex >= this.conditionOrder.length
  }

  recordInput(inputChar: string): { targetChar: string; inputChar: string; isCorrect: boolean } {
    const targetChar = this.getTargetChar()
    const isCorrect = inputChar === targetChar
    const record = { targetChar, inputChar, isCorrect }
    this.inputHistory.push(record)
    this.charIndex++
    if (this.isPhraseComplete()) {
      this.phraseIndex++
      this.charIndex = 0
    }
    return record
  }

  advanceCondition() {
    this.conditionIndex++
    this.phraseIndex = 0
    this.charIndex = 0
    this.inputHistory = []
  }
}
```

- [ ] **Step 5: Run tests to verify pass**

```bash
npx vitest run tests/core/ExperimentManager.test.ts
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/core/ExperimentManager.ts src/data/phrases.ts tests/core/ExperimentManager.test.ts
git commit -m "feat: add ExperimentManager with Latin square condition ordering"
```

---

## Task 8: DataStore

**Files:**
- Create: `src/core/DataStore.ts`, `tests/core/DataStore.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/core/DataStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { DataStore } from '../../src/core/DataStore'

// jsdom has no real IndexedDB; mock it minimally
import 'fake-indexeddb/auto'

describe('DataStore', () => {
  let store: DataStore

  beforeEach(async () => {
    store = new DataStore()
    await store.init()
  })

  it('saves and retrieves a session', async () => {
    const session = {
      id: 'abc',
      participantId: 'P01',
      language: 'en' as const,
      conditionOrder: [],
      smileCalibPeak: 0.8,
      smileThreshold: 0.64,
      startTime: 1000,
      endTime: 0,
    }
    await store.saveSession(session)
    const found = await store.getSession('abc')
    expect(found?.participantId).toBe('P01')
  })

  it('saves and retrieves events', async () => {
    const event = {
      sessionId: 'abc',
      conditionIndex: 0,
      layout: 'qwerty' as const,
      inputMethod: 'dwell' as const,
      phraseIndex: 0,
      targetChar: 't',
      inputChar: 't',
      isCorrect: true,
      gazeX: 0.5,
      gazeY: 0.5,
      blinkLeft: 0,
      blinkRight: 0,
      smileScore: 0,
      actionTimestamp: 2000,
      dwellDuration: 800,
    }
    await store.saveEvent(event)
    const events = await store.getEvents('abc')
    expect(events).toHaveLength(1)
    expect(events[0].targetChar).toBe('t')
  })
})
```

- [ ] **Step 2: Install fake-indexeddb for tests**

```bash
npm install -D fake-indexeddb
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx vitest run tests/core/DataStore.test.ts
```
Expected: FAIL

- [ ] **Step 4: Implement `src/core/DataStore.ts`**

```typescript
import { openDB, IDBPDatabase } from 'idb'
import type { Session, ExperimentEvent, SurveyResult } from '../types'

const DB_NAME = 'smile-input-research'
const DB_VERSION = 1

export class DataStore {
  private db: IDBPDatabase | null = null

  async init() {
    this.db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore('sessions', { keyPath: 'id' })
        db.createObjectStore('events', { autoIncrement: true })
        db.createObjectStore('surveys', { keyPath: 'sessionId' })
      },
    })
  }

  async saveSession(session: Session) {
    await this.db!.put('sessions', session)
  }

  async getSession(id: string): Promise<Session | undefined> {
    return this.db!.get('sessions', id)
  }

  async updateSessionEnd(id: string, endTime: number) {
    const session = await this.getSession(id)
    if (session) await this.saveSession({ ...session, endTime })
  }

  async saveEvent(event: ExperimentEvent) {
    await this.db!.add('events', event)
  }

  async getEvents(sessionId: string): Promise<ExperimentEvent[]> {
    const all: ExperimentEvent[] = await this.db!.getAll('events')
    return all.filter(e => e.sessionId === sessionId)
  }

  async saveSurvey(survey: SurveyResult) {
    await this.db!.put('surveys', survey)
  }

  async getSurvey(sessionId: string): Promise<SurveyResult | undefined> {
    return this.db!.get('surveys', sessionId)
  }

  exportCSV(sessionId: string): Promise<{ sessions: string; events: string; surveys: string }> {
    return Promise.all([
      this.getSession(sessionId),
      this.getEvents(sessionId),
      this.getSurvey(sessionId),
    ]).then(([session, events, survey]) => {
      const toCSV = (rows: object[]) => {
        if (!rows.length) return ''
        const headers = Object.keys(rows[0])
        const lines = rows.map(r =>
          Object.values(r).map(v =>
            typeof v === 'object' ? JSON.stringify(v) : String(v ?? '')
          ).join(',')
        )
        return [headers.join(','), ...lines].join('\n')
      }
      return {
        sessions: toCSV(session ? [session] : []),
        events: toCSV(events),
        surveys: toCSV(survey ? [survey] : []),
      }
    })
  }
}
```

- [ ] **Step 5: Run tests to verify pass**

```bash
npx vitest run tests/core/DataStore.test.ts
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/core/DataStore.ts tests/core/DataStore.test.ts
git commit -m "feat: add DataStore with IndexedDB and CSV export"
```

---

## Task 9: i18n System

**Files:**
- Create: `src/i18n/index.ts`, `src/i18n/zh.json`, `src/i18n/ja.json`, `src/i18n/en.json`

- [ ] **Step 1: Create `src/i18n/en.json`**

```json
{
  "welcome": {
    "title": "Gaze Input Research",
    "participantId": "Participant ID",
    "selectLanguage": "Select Language",
    "start": "Start"
  },
  "deviceCheck": {
    "title": "Device Check",
    "camera": "Camera",
    "tobii": "Tobii Eye Tracker",
    "cameraOk": "Camera ready",
    "cameraError": "Camera access denied",
    "tobiiOk": "Tobii connected",
    "tobiiError": "Tobii not connected — start bridge.py first",
    "tobiiReminder": "Please complete Tobii calibration in Tobii software before continuing.",
    "next": "Continue"
  },
  "tutorial": {
    "title": "Tutorial",
    "smileCalib": "Smile Calibration",
    "smileCalibInstruction": "Please smile naturally for 3 seconds.",
    "smileCalibStart": "Start Calibration",
    "smileCalibDone": "Calibration complete. Your smile threshold: {threshold}",
    "dwellInstruction": "Look at a key and hold your gaze to select it.",
    "blinkInstruction": "Look at a key and blink to select it.",
    "smileInstruction": "Look at a key, then smile to select it.",
    "practice": "Practice",
    "practiceTarget": "Input: {char}",
    "practiceComplete": "Practice complete!",
    "beginExperiment": "Begin Experiment"
  },
  "experiment": {
    "condition": "Condition {index} of 6",
    "layout": "Layout: {layout}",
    "inputMethod": "Method: {method}",
    "target": "Type: {phrase}",
    "rest": "Rest",
    "restMessage": "Take a break. Continue in {seconds}s.",
    "restSkip": "Continue now"
  },
  "survey": {
    "title": "How do you feel right now?",
    "instruction": "Rate each word on a scale of 1 (not at all) to 5 (extremely).",
    "submit": "Submit",
    "scale": ["Not at all", "A little", "Moderately", "Quite a bit", "Extremely"]
  },
  "export": {
    "title": "Experiment Complete",
    "download": "Download Data (CSV)",
    "thankYou": "Thank you for participating!"
  },
  "panas": {
    "items": [
      "Interested", "Distressed", "Excited", "Upset", "Strong",
      "Guilty", "Scared", "Enthusiastic", "Proud", "Irritable",
      "Alert", "Ashamed", "Inspired", "Nervous", "Determined",
      "Attentive", "Jittery", "Active", "Afraid", "Hostile"
    ],
    "pa": [0, 2, 4, 8, 10, 12, 14, 15, 17, 3],
    "na": [1, 3, 5, 6, 9, 11, 13, 16, 18, 19]
  }
}
```

- [ ] **Step 2: Create `src/i18n/zh.json`**

```json
{
  "welcome": {
    "title": "眼动输入研究",
    "participantId": "参与者编号",
    "selectLanguage": "选择语言",
    "start": "开始"
  },
  "deviceCheck": {
    "title": "设备检查",
    "camera": "摄像头",
    "tobii": "Tobii 眼动仪",
    "cameraOk": "摄像头就绪",
    "cameraError": "摄像头访问被拒绝",
    "tobiiOk": "Tobii 已连接",
    "tobiiError": "Tobii 未连接 — 请先启动 bridge.py",
    "tobiiReminder": "请在继续前先在 Tobii 软件中完成校准。",
    "next": "继续"
  },
  "tutorial": {
    "title": "教程",
    "smileCalib": "微笑校准",
    "smileCalibInstruction": "请自然微笑 3 秒。",
    "smileCalibStart": "开始校准",
    "smileCalibDone": "校准完成。您的微笑阈值：{threshold}",
    "dwellInstruction": "注视某个按键并保持注视以选中它。",
    "blinkInstruction": "注视某个按键后眨眼以选中它。",
    "smileInstruction": "注视某个按键后微笑以选中它。",
    "practice": "练习",
    "practiceTarget": "输入：{char}",
    "practiceComplete": "练习完成！",
    "beginExperiment": "开始实验"
  },
  "experiment": {
    "condition": "条件 {index} / 6",
    "layout": "布局：{layout}",
    "inputMethod": "方式：{method}",
    "target": "请输入：{phrase}",
    "rest": "休息",
    "restMessage": "请休息。{seconds} 秒后继续。",
    "restSkip": "现在继续"
  },
  "survey": {
    "title": "您现在感觉如何？",
    "instruction": "请根据每个词语评分：1（完全没有）到 5（非常强烈）。",
    "submit": "提交",
    "scale": ["完全没有", "有一点", "适度", "相当多", "非常强烈"]
  },
  "export": {
    "title": "实验结束",
    "download": "下载数据（CSV）",
    "thankYou": "感谢您的参与！"
  },
  "panas": {
    "items": [
      "感兴趣的", "苦恼的", "兴奋的", "烦乱的", "强壮的",
      "有罪恶感的", "害怕的", "热情的", "自豪的", "易怒的",
      "警觉的", "惭愧的", "受鼓舞的", "紧张的", "坚定的",
      "专注的", "坐立不安的", "积极的", "恐惧的", "敌意的"
    ],
    "pa": [0, 2, 4, 8, 10, 12, 14, 15, 17, 3],
    "na": [1, 3, 5, 6, 9, 11, 13, 16, 18, 19]
  }
}
```

- [ ] **Step 3: Create `src/i18n/ja.json`**

```json
{
  "welcome": {
    "title": "視線入力研究",
    "participantId": "参加者ID",
    "selectLanguage": "言語を選択",
    "start": "開始"
  },
  "deviceCheck": {
    "title": "デバイス確認",
    "camera": "カメラ",
    "tobii": "Tobii アイトラッカー",
    "cameraOk": "カメラ準備完了",
    "cameraError": "カメラへのアクセスが拒否されました",
    "tobiiOk": "Tobii 接続済み",
    "tobiiError": "Tobii 未接続 — bridge.py を起動してください",
    "tobiiReminder": "続行前に、Tobii ソフトウェアでキャリブレーションを完了してください。",
    "next": "次へ"
  },
  "tutorial": {
    "title": "チュートリアル",
    "smileCalib": "笑顔キャリブレーション",
    "smileCalibInstruction": "3秒間、自然に笑ってください。",
    "smileCalibStart": "キャリブレーション開始",
    "smileCalibDone": "キャリブレーション完了。笑顔しきい値：{threshold}",
    "dwellInstruction": "キーを見つめて視線を保持すると選択されます。",
    "blinkInstruction": "キーを見つめてまばたきすると選択されます。",
    "smileInstruction": "キーを見つめて笑顔になると選択されます。",
    "practice": "練習",
    "practiceTarget": "入力：{char}",
    "practiceComplete": "練習完了！",
    "beginExperiment": "実験開始"
  },
  "experiment": {
    "condition": "条件 {index} / 6",
    "layout": "レイアウト：{layout}",
    "inputMethod": "方式：{method}",
    "target": "入力してください：{phrase}",
    "rest": "休憩",
    "restMessage": "休憩してください。{seconds}秒後に続きます。",
    "restSkip": "今すぐ続ける"
  },
  "survey": {
    "title": "今の気持ちはどうですか？",
    "instruction": "各単語について1（全くない）から5（非常に強い）で評価してください。",
    "submit": "送信",
    "scale": ["全くない", "少し", "適度に", "かなり", "非常に強く"]
  },
  "export": {
    "title": "実験終了",
    "download": "データをダウンロード（CSV）",
    "thankYou": "ご参加ありがとうございました！"
  },
  "panas": {
    "items": [
      "関心がある", "苦悩した", "興奮している", "動揺した", "強い",
      "罪悪感のある", "怖い", "熱心な", "誇らしい", "いらいらした",
      "注意深い", "恥ずかしい", "インスピレーションを受けた", "緊張した", "断固とした",
      "注意を向けている", "そわそわした", "活動的な", "恐れた", "敵意のある"
    ],
    "pa": [0, 2, 4, 8, 10, 12, 14, 15, 17, 3],
    "na": [1, 3, 5, 6, 9, 11, 13, 16, 18, 19]
  }
}
```

- [ ] **Step 4: Create `src/i18n/index.ts`**

```typescript
import { createContext, useContext, useState, type ReactNode } from 'react'
import type { Language } from '../types'
import zh from './zh.json'
import ja from './ja.json'
import en from './en.json'

const locales = { zh, ja, en }

type Locale = typeof en

interface I18nContext {
  lang: Language
  setLang: (l: Language) => void
  t: (key: string, vars?: Record<string, string>) => string
}

const Context = createContext<I18nContext>({} as I18nContext)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Language>('en')

  const t = (key: string, vars?: Record<string, string>): string => {
    const parts = key.split('.')
    let val: unknown = locales[lang]
    for (const p of parts) val = (val as Record<string, unknown>)?.[p]
    let str = typeof val === 'string' ? val : key
    if (vars) {
      for (const [k, v] of Object.entries(vars)) str = str.replace(`{${k}}`, v)
    }
    return str
  }

  return <Context.Provider value={{ lang, setLang, t }}>{children}</Context.Provider>
}

export const useI18n = () => useContext(Context)
```

- [ ] **Step 5: Commit**

```bash
git add src/i18n/
git commit -m "feat: add i18n system with ZH/JA/EN locales and PANAS items"
```

---

## Task 10: Keyboard Components

**Files:**
- Create: `src/components/keyboards/KeyboardKey.tsx`, `src/components/keyboards/QwertyKeyboard.tsx`, `src/components/keyboards/OptiKeyboard.tsx`, `src/components/GazeCursor.tsx`

- [ ] **Step 1: Create `src/components/keyboards/KeyboardKey.tsx`**

```tsx
import { useEffect, useRef } from 'react'
import type { InputController } from '../../core/InputController'

interface Props {
  label: string
  controller: InputController
  onKeyRect: (key: string, rect: DOMRect) => void
  isTarget?: boolean
  style?: React.CSSProperties
}

export function KeyboardKey({ label, controller, onKeyRect, isTarget, style }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect()
      onKeyRect(label, rect)
    }
  }, [label, onKeyRect])

  const progress = controller.getDwellProgress(label)
  const isLocked = controller.getLockedKey() === label
  const circumference = 2 * Math.PI * 22  // r=22

  return (
    <div
      ref={ref}
      style={{
        position: 'relative',
        width: 48,
        height: 48,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: isTarget ? '#1a3a5c' : '#1e1e3e',
        border: `2px solid ${isLocked ? '#f1fa8c' : isTarget ? '#50fa7b' : '#333'}`,
        borderRadius: 6,
        color: isTarget ? '#50fa7b' : '#aaa',
        fontSize: 14,
        fontWeight: isTarget ? 'bold' : 'normal',
        userSelect: 'none',
        cursor: 'default',
        ...style,
      }}
    >
      {progress > 0 && (
        <svg
          style={{ position: 'absolute', top: -3, left: -3, pointerEvents: 'none' }}
          width={54}
          height={54}
        >
          <circle cx={27} cy={27} r={22} fill="none" stroke="#333" strokeWidth={3} />
          <circle
            cx={27}
            cy={27}
            r={22}
            fill="none"
            stroke="#5a7aff"
            strokeWidth={3}
            strokeDasharray={`${progress * circumference} ${circumference}`}
            strokeDashoffset={0}
            transform="rotate(-90 27 27)"
          />
        </svg>
      )}
      {label === 'SPACE' ? '␣' : label}
    </div>
  )
}
```

- [ ] **Step 2: Create `src/components/keyboards/QwertyKeyboard.tsx`**

```tsx
import { useCallback } from 'react'
import type { InputController } from '../../core/InputController'
import type { GazePoint } from '../../types'
import { KeyboardKey } from './KeyboardKey'

const ROWS = [
  ['Q','W','E','R','T','Y','U','I','O','P'],
  ['A','S','D','F','G','H','J','K','L'],
  ['Z','X','C','V','B','N','M','SPACE','BACKSPACE'],
]

interface Props {
  controller: InputController
  gaze: GazePoint | null
  targetChar: string
  onKeyRect: (key: string, rect: DOMRect) => void
}

export function QwertyKeyboard({ controller, gaze, targetChar, onKeyRect }: Props) {
  const handleRect = useCallback(onKeyRect, [onKeyRect])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center', padding: 16 }}>
      {ROWS.map((row, ri) => (
        <div key={ri} style={{ display: 'flex', gap: 6, marginLeft: ri === 1 ? 24 : ri === 2 ? 48 : 0 }}>
          {row.map(key => (
            <KeyboardKey
              key={key}
              label={key}
              controller={controller}
              onKeyRect={handleRect}
              isTarget={key.toLowerCase() === targetChar || (key === 'SPACE' && targetChar === ' ')}
              style={key === 'BACKSPACE' ? { width: 72 } : key === 'SPACE' ? { width: 120 } : undefined}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Create `src/components/keyboards/OptiKeyboard.tsx`**

```tsx
import { useCallback } from 'react'
import type { InputController } from '../../core/InputController'
import type { GazePoint } from '../../types'
import { KeyboardKey } from './KeyboardKey'

// OPTI layout — staggered grid, high-frequency letters centrally placed,
// multiple SPACE keys. Positions based on Isokoski & Back (2002) design principles.
// Verify exact arrangement against original paper before final experiment.
const ROWS = [
  ['Q','Z','J','X','V','W','Y'],
  ['K','B','P','F','G','M'],
  ['L','D','C','U','SPACE','O','SPACE'],
  ['SPACE','H','A','E','N','SPACE'],
  ['I','T','S','R'],
]

interface Props {
  controller: InputController
  gaze: GazePoint | null
  targetChar: string
  onKeyRect: (key: string, rect: DOMRect) => void
}

export function OptiKeyboard({ controller, gaze, targetChar, onKeyRect }: Props) {
  const handleRect = useCallback(onKeyRect, [onKeyRect])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center', padding: 16 }}>
      {ROWS.map((row, ri) => (
        <div
          key={ri}
          style={{
            display: 'flex',
            gap: 6,
            marginLeft: [0, 24, 12, 36, 48][ri] ?? 0,
          }}
        >
          {row.map((key, ki) => (
            <KeyboardKey
              key={`${ri}-${ki}`}
              label={key}
              controller={controller}
              onKeyRect={handleRect}
              isTarget={key.toLowerCase() === targetChar || (key === 'SPACE' && targetChar === ' ')}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Create `src/components/GazeCursor.tsx`**

```tsx
import type { GazePoint } from '../types'

interface Props {
  gaze: GazePoint | null
}

export function GazeCursor({ gaze }: Props) {
  if (!gaze) return null
  const x = gaze.x * window.innerWidth
  const y = gaze.y * window.innerHeight
  return (
    <div
      style={{
        position: 'fixed',
        left: x - 10,
        top: y - 10,
        width: 20,
        height: 20,
        borderRadius: '50%',
        border: '2px solid rgba(255,107,107,0.8)',
        background: 'rgba(255,107,107,0.2)',
        pointerEvents: 'none',
        zIndex: 9999,
        transition: 'left 16ms linear, top 16ms linear',
      }}
    />
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add src/components/
git commit -m "feat: add keyboard components (QWERTY, OPTI) and GazeCursor"
```

---

## Task 11: App Shell + Page Router

**Files:**
- Create: `src/App.tsx`, update `src/main.tsx`

- [ ] **Step 1: Create `src/App.tsx`**

```tsx
import { useState } from 'react'
import type { AppPage, Language } from './types'
import { I18nProvider } from './i18n'
import { WelcomePage } from './pages/WelcomePage'
import { DeviceCheckPage } from './pages/DeviceCheckPage'
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
}

export default function App() {
  const [page, setPage] = useState<AppPage>('welcome')
  const [session, setSession] = useState<SessionState | null>(null)

  const goTo = (p: AppPage) => setPage(p)

  return (
    <I18nProvider>
      <div style={{ minHeight: '100vh', background: '#0d1117', color: '#cdd6f4', fontFamily: 'system-ui, sans-serif' }}>
        {page === 'welcome'      && <WelcomePage onNext={(s) => { setSession(s); goTo('device-check') }} />}
        {page === 'device-check' && <DeviceCheckPage onNext={() => goTo('tutorial')} />}
        {page === 'tutorial'     && session && (
          <TutorialPage
            participantId={session.participantId}
            onNext={(peak, threshold) => { setSession({ ...session, smileCalibPeak: peak, smileThreshold: threshold }); goTo('experiment') }}
          />
        )}
        {page === 'experiment'   && session && (
          <ExperimentPage session={session} onNext={() => goTo('survey')} />
        )}
        {page === 'survey'       && session && (
          <SurveyPage sessionId={session.sessionId} onNext={() => goTo('export')} />
        )}
        {page === 'export'       && session && <ExportPage sessionId={session.sessionId} />}
      </div>
    </I18nProvider>
  )
}
```

- [ ] **Step 2: Update `src/main.tsx`**

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

- [ ] **Step 3: Replace `src/index.css` with minimal reset**

```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #0d1117; color: #cdd6f4; }
```

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/main.tsx src/index.css
git commit -m "feat: add App shell with linear page state machine"
```

---

## Task 12: WelcomePage + DeviceCheckPage

**Files:**
- Create: `src/pages/WelcomePage.tsx`, `src/pages/DeviceCheckPage.tsx`

- [ ] **Step 1: Create `src/pages/WelcomePage.tsx`**

```tsx
import { useState } from 'react'
import { useI18n } from '../i18n'
import type { Language } from '../types'
import type { SessionState } from '../App'
import { v4 as uuid } from 'uuid'

interface Props {
  onNext: (session: SessionState) => void
}

export function WelcomePage({ onNext }: Props) {
  const { t, lang, setLang } = useI18n()
  const [pid, setPid] = useState('')

  const handleStart = () => {
    if (!pid.trim()) return
    onNext({ participantId: pid.trim(), language: lang, sessionId: uuid(), smileCalibPeak: 0, smileThreshold: 0.6 })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: 24 }}>
      <h1 style={{ fontSize: 28 }}>{t('welcome.title')}</h1>
      <div style={{ display: 'flex', gap: 12 }}>
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
      <input
        placeholder={t('welcome.participantId')}
        value={pid}
        onChange={e => setPid(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleStart()}
        style={{ padding: '10px 16px', borderRadius: 6, border: '1px solid #444', background: '#1a1a2e', color: '#fff', fontSize: 16, width: 240 }}
      />
      <button
        onClick={handleStart}
        disabled={!pid.trim()}
        style={{ padding: '12px 32px', borderRadius: 8, border: 'none', background: '#5a7aff', color: '#fff', fontSize: 16, cursor: pid.trim() ? 'pointer' : 'not-allowed', opacity: pid.trim() ? 1 : 0.5 }}
      >
        {t('welcome.start')}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Install uuid**

```bash
npm install uuid
npm install -D @types/uuid
```

- [ ] **Step 3: Create `src/pages/DeviceCheckPage.tsx`**

```tsx
import { useState, useEffect, useRef } from 'react'
import { useI18n } from '../i18n'
import { GazeLayer } from '../core/GazeLayer'

interface Props {
  onNext: () => void
}

export function DeviceCheckPage({ onNext }: Props) {
  const { t } = useI18n()
  const [cameraOk, setCameraOk] = useState(false)
  const [tobiiOk, setTobiiOk] = useState(false)
  const gazeRef = useRef<GazeLayer | null>(null)

  useEffect(() => {
    // Check camera
    navigator.mediaDevices.getUserMedia({ video: true })
      .then(() => setCameraOk(true))
      .catch(() => setCameraOk(false))

    // Check Tobii WebSocket
    const gaze = new GazeLayer('ws://localhost:7070')
    gazeRef.current = gaze
    const ws = new WebSocket('ws://localhost:7070')
    ws.onopen = () => { setTobiiOk(true); ws.close() }
    ws.onerror = () => setTobiiOk(false)

    return () => { ws.close() }
  }, [])

  const canContinue = cameraOk && tobiiOk

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: 24 }}>
      <h1>{t('deviceCheck.title')}</h1>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 320 }}>
        <StatusRow label={t('deviceCheck.camera')} ok={cameraOk} okText={t('deviceCheck.cameraOk')} errText={t('deviceCheck.cameraError')} />
        <StatusRow label={t('deviceCheck.tobii')} ok={tobiiOk} okText={t('deviceCheck.tobiiOk')} errText={t('deviceCheck.tobiiError')} />
      </div>
      <p style={{ color: '#888', fontSize: 13, maxWidth: 400, textAlign: 'center' }}>
        {t('deviceCheck.tobiiReminder')}
      </p>
      <button
        onClick={onNext}
        disabled={!canContinue}
        style={{ padding: '12px 32px', borderRadius: 8, border: 'none', background: canContinue ? '#50fa7b' : '#333', color: canContinue ? '#000' : '#666', fontSize: 16, cursor: canContinue ? 'pointer' : 'not-allowed' }}
      >
        {t('deviceCheck.next')}
      </button>
    </div>
  )
}

function StatusRow({ label, ok, okText, errText }: { label: string; ok: boolean; okText: string; errText: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 16px', background: '#1a1a2e', borderRadius: 6, border: `1px solid ${ok ? '#50fa7b' : '#ff6b6b'}` }}>
      <span>{label}</span>
      <span style={{ color: ok ? '#50fa7b' : '#ff6b6b' }}>{ok ? okText : errText}</span>
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/WelcomePage.tsx src/pages/DeviceCheckPage.tsx
git commit -m "feat: add WelcomePage and DeviceCheckPage"
```

---

## Task 13: TutorialPage

**Files:**
- Create: `src/pages/TutorialPage.tsx`

- [ ] **Step 1: Create `src/pages/TutorialPage.tsx`**

```tsx
import { useState, useEffect, useRef } from 'react'
import { useI18n } from '../i18n'
import { FaceDetector } from '../core/FaceDetector'
import type { InputMethod } from '../types'

interface Props {
  participantId: string
  onNext: (smileCalibPeak: number, smileThreshold: number) => void
}

type Step = 'smile-calib' | 'dwell-practice' | 'blink-practice' | 'smile-practice' | 'done'

export function TutorialPage({ participantId, onNext }: Props) {
  const { t } = useI18n()
  const [step, setStep] = useState<Step>('smile-calib')
  const [calibrating, setCalibrating] = useState(false)
  const [smileScore, setSmileScore] = useState(0)
  const [peakSmile, setPeakSmile] = useState(0)
  const [threshold, setThreshold] = useState(0)
  const [practiceChar, setPracticeChar] = useState('e')
  const [practiceCount, setPracticeCount] = useState(0)
  const detectorRef = useRef<FaceDetector | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const detector = new FaceDetector()
    detectorRef.current = detector
    let stream: MediaStream

    detector.init().then(() => {
      navigator.mediaDevices.getUserMedia({ video: true }).then(s => {
        stream = s
        if (videoRef.current) {
          videoRef.current.srcObject = s
          videoRef.current.play()
          detector.start(videoRef.current)
        }
      })
    })

    detector.onFace(face => setSmileScore(face.smileScore))

    return () => {
      detector.stop()
      stream?.getTracks().forEach(t => t.stop())
    }
  }, [])

  const runCalibration = () => {
    setCalibrating(true)
    setPeakSmile(0)
    let peak = 0
    const interval = setInterval(() => {
      setSmileScore(s => {
        if (s > peak) peak = s
        return s
      })
    }, 50)
    setTimeout(() => {
      clearInterval(interval)
      // Read actual peak from detector
      const th = peak * 0.8
      setThreshold(th)
      setPeakSmile(peak)
      setCalibrating(false)
    }, 3000)
  }

  const PRACTICE_CHARS = ['e', 't', 'a']

  if (step === 'smile-calib') return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: 20 }}>
      <video ref={videoRef} style={{ display: 'none' }} />
      <h2>{t('tutorial.smileCalib')}</h2>
      <p>{t('tutorial.smileCalibInstruction')}</p>
      <div style={{ fontSize: 24, color: '#f1fa8c' }}>
        {(smileScore * 100).toFixed(0)}%
      </div>
      {!calibrating && threshold === 0 && (
        <button onClick={runCalibration} style={btnStyle('#5a7aff')}>{t('tutorial.smileCalibStart')}</button>
      )}
      {calibrating && <p style={{ color: '#888' }}>...</p>}
      {threshold > 0 && (
        <>
          <p style={{ color: '#50fa7b' }}>{t('tutorial.smileCalibDone', { threshold: (threshold * 100).toFixed(0) + '%' })}</p>
          <button onClick={() => setStep('dwell-practice')} style={btnStyle('#50fa7b')}>{t('tutorial.beginExperiment')}</button>
        </>
      )}
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: 20 }}>
      <h2>{t('tutorial.title')}</h2>
      <p>{t(`tutorial.${step === 'dwell-practice' ? 'dwell' : step === 'blink-practice' ? 'blink' : 'smile'}Instruction`)}</p>
      <p style={{ fontSize: 20 }}>{t('tutorial.practiceTarget', { char: PRACTICE_CHARS[practiceCount] })}</p>
      <button
        onClick={() => {
          if (practiceCount < 2) {
            setPracticeCount(c => c + 1)
          } else {
            setPracticeCount(0)
            const next: Step = step === 'dwell-practice' ? 'blink-practice' : step === 'blink-practice' ? 'smile-practice' : 'done'
            setStep(next)
            if (next === 'done') onNext(peakSmile, threshold)
          }
        }}
        style={btnStyle('#5a7aff')}
      >
        {practiceCount < 2 ? t('tutorial.practice') : t('tutorial.practiceComplete')}
      </button>
    </div>
  )
}

const btnStyle = (bg: string): React.CSSProperties => ({
  padding: '12px 32px', borderRadius: 8, border: 'none', background: bg,
  color: bg === '#50fa7b' ? '#000' : '#fff', fontSize: 16, cursor: 'pointer',
})
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/TutorialPage.tsx
git commit -m "feat: add TutorialPage with smile calibration and method practice"
```

---

## Task 14: ExperimentPage

**Files:**
- Create: `src/pages/ExperimentPage.tsx`

- [ ] **Step 1: Create `src/pages/ExperimentPage.tsx`**

```tsx
import { useState, useEffect, useRef, useCallback } from 'react'
import { useI18n } from '../i18n'
import type { SessionState } from '../App'
import type { GazePoint, ExperimentEvent } from '../types'
import { GazeLayer } from '../core/GazeLayer'
import { FaceDetector } from '../core/FaceDetector'
import { InputController } from '../core/InputController'
import { ExperimentManager } from '../core/ExperimentManager'
import { DataStore } from '../core/DataStore'
import { GazeCursor } from '../components/GazeCursor'
import { QwertyKeyboard } from '../components/keyboards/QwertyKeyboard'
import { OptiKeyboard } from '../components/keyboards/OptiKeyboard'

interface Props {
  session: SessionState
  onNext: () => void
}

const REST_SECS = 60
const REST_MIN_SECS = 30

export function ExperimentPage({ session, onNext }: Props) {
  const { t } = useI18n()
  const [gaze, setGaze] = useState<GazePoint | null>(null)
  const [resting, setResting] = useState(false)
  const [restSecsLeft, setRestSecsLeft] = useState(REST_SECS)
  const [inputText, setInputText] = useState('')
  const [conditionIndex, setConditionIndex] = useState(0)
  const [, forceUpdate] = useState(0)

  const keyRects = useRef<Map<string, DOMRect>>(new Map())
  const gazeLayerRef = useRef(new GazeLayer('ws://localhost:7070'))
  const faceDetectorRef = useRef(new FaceDetector())
  const managerRef = useRef(new ExperimentManager(session.participantId))
  const storeRef = useRef(new DataStore())
  const videoRef = useRef<HTMLVideoElement>(null)
  const controllerRef = useRef<InputController | null>(null)

  const manager = managerRef.current
  const store = storeRef.current
  const condition = manager.getConditionOrder()[conditionIndex]

  // Reinitialize controller when condition changes
  useEffect(() => {
    controllerRef.current = new InputController(condition.inputMethod, session.smileThreshold)
    const ctrl = controllerRef.current
    manager.startCondition(conditionIndex)
    setInputText('')

    const unsub = ctrl.onInput((fired) => {
      const inputChar = fired.key === 'SPACE' ? ' ' : fired.key.toLowerCase()
      const phraseIndex = manager.getPhraseIndex()  // capture BEFORE recordInput advances it
      const record = manager.recordInput(inputChar)

      const event: ExperimentEvent = {
        sessionId: session.sessionId,
        conditionIndex,
        layout: condition.layout,
        inputMethod: condition.inputMethod,
        phraseIndex,
        targetChar: record.targetChar,
        inputChar: record.inputChar,
        isCorrect: record.isCorrect,
        gazeX: fired.gazeX,
        gazeY: fired.gazeY,
        blinkLeft: fired.blinkLeft,
        blinkRight: fired.blinkRight,
        smileScore: fired.smileScore,
        actionTimestamp: fired.ts,
        dwellDuration: fired.dwellDuration,
      }
      store.saveEvent(event)
      setInputText(manager.getCurrentPhrase().slice(0, manager.getCharIndex()))
      forceUpdate(n => n + 1)

      if (manager.isConditionComplete()) {
        if (conditionIndex + 1 >= 6) {
          store.updateSessionEnd(session.sessionId, Date.now())
          onNext()
        } else {
          setResting(true)
          setRestSecsLeft(REST_SECS)
        }
      }
    })
    return unsub
  }, [conditionIndex])

  const prevHitKey = useRef<string | null>(null)

  // Setup gaze layer + save session
  useEffect(() => {
    store.init().then(() => {
      store.saveSession({
        id: session.sessionId,
        participantId: session.participantId,
        language: session.language,
        conditionOrder: manager.getConditionOrder(),
        smileCalibPeak: session.smileCalibPeak,
        smileThreshold: session.smileThreshold,
        startTime: Date.now(),
        endTime: 0,
      })
    })
    const gLayer = gazeLayerRef.current
    gLayer.connect()
    const unsub = gLayer.onGaze((g) => {
      setGaze(g)
      if (controllerRef.current) controllerRef.current.setGaze(g)

      // Hit-test key rects
      const px = gLayer.toPixel(g, window.innerWidth, window.innerHeight)
      let hit: string | null = null
      keyRects.current.forEach((rect, key) => {
        if (px.x >= rect.left && px.x <= rect.right && px.y >= rect.top && px.y <= rect.bottom) hit = key
      })
      const ctrl = controllerRef.current
      if (ctrl) {
        if (hit !== prevHitKey.current) {
          if (prevHitKey.current) ctrl.gazeLeaveKey(prevHitKey.current)
          if (hit) ctrl.gazeEnterKey(hit, g)
          prevHitKey.current = hit
        }
      }
    })
    return () => { unsub(); gLayer.disconnect() }
  }, [])

  // Setup face detector
  useEffect(() => {
    const det = faceDetectorRef.current
    det.init().then(() => {
      navigator.mediaDevices.getUserMedia({ video: true }).then(stream => {
        if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play() }
        det.start(videoRef.current!)
      })
    })
    det.onFace(face => { if (controllerRef.current) controllerRef.current.feedFace(face) })
    return () => det.stop()
  }, [])

  // Rest timer
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

  const handleKeyRect = useCallback((key: string, rect: DOMRect) => {
    keyRects.current.set(key, rect)
  }, [])

  if (resting) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: 20 }}>
      <h2>{t('experiment.rest')}</h2>
      <p>{t('experiment.restMessage', { seconds: String(restSecsLeft) })}</p>
      {restSecsLeft <= REST_MIN_SECS && (
        <button onClick={() => { setResting(false); setConditionIndex(i => i + 1) }} style={{ padding: '12px 24px', borderRadius: 8, border: 'none', background: '#5a7aff', color: '#fff', cursor: 'pointer' }}>
          {t('experiment.restSkip')}
        </button>
      )}
    </div>
  )

  const ctrl = controllerRef.current
  const targetChar = manager.getTargetChar()
  const phrase = manager.getCurrentPhrase()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: '100vh', paddingTop: 24, gap: 16 }}>
      <video ref={videoRef} style={{ display: 'none' }} />
      <GazeCursor gaze={gaze} />

      <div style={{ fontSize: 13, color: '#888' }}>
        {t('experiment.condition', { index: String(conditionIndex + 1) })} — {condition.layout.toUpperCase()} / {condition.inputMethod}
      </div>

      <div style={{ fontSize: 18, letterSpacing: 3, fontFamily: 'monospace' }}>
        {phrase.split('').map((ch, i) => (
          <span key={i} style={{ color: i < manager.getCharIndex() ? '#50fa7b' : i === manager.getCharIndex() ? '#fff' : '#444', fontWeight: i === manager.getCharIndex() ? 'bold' : 'normal', textDecoration: i === manager.getCharIndex() ? 'underline' : 'none' }}>
            {ch}
          </span>
        ))}
      </div>

      {condition.inputMethod === 'smile' && ctrl && (
        <div style={{ fontSize: 13, color: '#f1fa8c' }}>
          😊 {(ctrl.getSmileScore() * 100).toFixed(0)}%
          {ctrl.getLockedKey() && <span style={{ marginLeft: 12 }}>🔒 {ctrl.getLockedKey()}</span>}
        </div>
      )}

      {ctrl && (
        condition.layout === 'qwerty'
          ? <QwertyKeyboard controller={ctrl} gaze={gaze} targetChar={targetChar} onKeyRect={handleKeyRect} />
          : <OptiKeyboard controller={ctrl} gaze={gaze} targetChar={targetChar} onKeyRect={handleKeyRect} />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/ExperimentPage.tsx
git commit -m "feat: add ExperimentPage with full experiment loop"
```

---

## Task 15: SurveyPage + ExportPage

**Files:**
- Create: `src/pages/SurveyPage.tsx`, `src/pages/ExportPage.tsx`

- [ ] **Step 1: Create `src/pages/SurveyPage.tsx`**

```tsx
import { useState } from 'react'
import { useI18n } from '../i18n'
import { DataStore } from '../core/DataStore'
import type { SurveyResult } from '../types'

interface Props {
  sessionId: string
  onNext: () => void
}

export function SurveyPage({ sessionId, onNext }: Props) {
  const { t } = useI18n()
  const items: string[] = t('panas.items') as unknown as string[]
  const scale: string[] = t('survey.scale') as unknown as string[]
  const [answers, setAnswers] = useState<number[]>(new Array(20).fill(0))

  const allAnswered = answers.every(a => a > 0)

  const handleSubmit = async () => {
    const paIndices: number[] = [0, 2, 4, 8, 10, 12, 14, 15, 17, 3]
    const naIndices: number[] = [1, 3, 5, 6, 9, 11, 13, 16, 18, 19]
    const paScore = paIndices.reduce((sum, i) => sum + (answers[i] || 0), 0)
    const naScore = naIndices.reduce((sum, i) => sum + (answers[i] || 0), 0)
    const survey: SurveyResult = { sessionId, paScore, naScore, rawAnswers: answers, submittedAt: Date.now() }
    const store = new DataStore()
    await store.init()
    await store.saveSurvey(survey)
    onNext()
  }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 16px' }}>
      <h2 style={{ marginBottom: 8 }}>{t('survey.title')}</h2>
      <p style={{ color: '#888', marginBottom: 24, fontSize: 13 }}>{t('survey.instruction')}</p>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, marginBottom: 8 }}>
        {scale.map((s, i) => (
          <div key={i} style={{ width: 60, textAlign: 'center', fontSize: 11, color: '#666' }}>{i + 1}<br/>{s}</div>
        ))}
      </div>

      {(items as string[]).map((item, idx) => (
        <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #222' }}>
          <span style={{ flex: 1 }}>{item}</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {[1, 2, 3, 4, 5].map(v => (
              <button
                key={v}
                onClick={() => setAnswers(a => { const n = [...a]; n[idx] = v; return n })}
                style={{
                  width: 60, height: 32, borderRadius: 4, border: 'none', cursor: 'pointer',
                  background: answers[idx] === v ? '#5a7aff' : '#1e1e3e',
                  color: answers[idx] === v ? '#fff' : '#888', fontSize: 13,
                }}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      ))}

      <button
        onClick={handleSubmit}
        disabled={!allAnswered}
        style={{ marginTop: 24, padding: '12px 32px', borderRadius: 8, border: 'none', background: allAnswered ? '#50fa7b' : '#333', color: allAnswered ? '#000' : '#666', fontSize: 16, cursor: allAnswered ? 'pointer' : 'not-allowed', width: '100%' }}
      >
        {t('survey.submit')}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Create `src/pages/ExportPage.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { useI18n } from '../i18n'
import { DataStore } from '../core/DataStore'

interface Props {
  sessionId: string
}

export function ExportPage({ sessionId }: Props) {
  const { t } = useI18n()
  const [ready, setReady] = useState(false)
  const [csvData, setCsvData] = useState<{ sessions: string; events: string; surveys: string } | null>(null)

  useEffect(() => {
    const store = new DataStore()
    store.init().then(async () => {
      const data = await store.exportCSV(sessionId)
      setCsvData(data)
      setReady(true)
    })
  }, [sessionId])

  const downloadCSV = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: 20 }}>
      <h2>{t('export.title')}</h2>
      <p style={{ color: '#50fa7b', fontSize: 20 }}>{t('export.thankYou')}</p>
      {ready && csvData && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(['sessions', 'events', 'surveys'] as const).map(key => (
            <button
              key={key}
              onClick={() => downloadCSV(csvData[key], `${sessionId}_${key}.csv`)}
              style={{ padding: '12px 32px', borderRadius: 8, border: 'none', background: '#5a7aff', color: '#fff', fontSize: 15, cursor: 'pointer' }}
            >
              {t('export.download')} — {key}.csv
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/SurveyPage.tsx src/pages/ExportPage.tsx
git commit -m "feat: add SurveyPage (PANAS) and ExportPage (CSV download)"
```

---

## Task 16: Integration Smoke Test

- [ ] **Step 1: Run all unit tests**

```bash
npx vitest run
```
Expected: All tests pass (GazeLayer, InputController, ExperimentManager, DataStore)

- [ ] **Step 2: Start bridge in mock mode (separate terminal)**

```bash
cd tobii-bridge && py bridge.py --mock
```

- [ ] **Step 3: Start dev server**

```bash
npm run dev
```

- [ ] **Step 4: Manual smoke test checklist**

Open http://localhost:5173 and verify:
- [ ] Welcome page: language switching works, participant ID input works, Start button enables
- [ ] Device Check: camera permission prompt appears, Tobii shows "connected" (bridge running)
- [ ] Tutorial: smile calibration UI displays, practice letters cycle through e/t/a
- [ ] Experiment: gaze cursor moves with mouse (mock mode), keyboard renders, target character highlighted
- [ ] QWERTY → OPTI layout switch between conditions works
- [ ] Rest screen shows after condition completes
- [ ] Survey: all 20 PANAS items render, ratings can be selected, submit enabled when all answered
- [ ] Export: CSV download buttons appear, files download correctly

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete smile input research experiment system"
```
