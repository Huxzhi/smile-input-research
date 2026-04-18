export type Layout = 'qwerty' | 'opti'
export type InputMethod = 'dwell' | 'blink' | 'smile'
export type Language = 'zh' | 'ja' | 'en'
export type AppPage =
  | 'debug'
  | 'welcome'
  | 'tutorial'
  | 'experiment'
  | 'survey'
  | 'export'

export interface ConditionConfig {
  layout: Layout
  inputMethod: InputMethod
}

export interface GazePoint {
  x: number          // normalized 0–1 (fraction of screen width)
  y: number          // normalized 0–1 (fraction of screen height)
  ts: number         // unix ms
  eyeOpen?: boolean  // both eyes open (eye_open)
  leftOpen?: boolean // left eye open (left_open)
  rightOpen?: boolean// right eye open (right_open)
}

export interface FaceLandmark {
  x: number  // normalized 0–1
  y: number
  z: number
}

export interface FaceEvent {
  smileScore: number    // 0–1, weighted combination of mouth corners + cheek squint
  mouthSmile: number    // 0–1, (mouthSmileLeft + mouthSmileRight) / 2
  cheekSquint: number   // 0–1, (cheekSquintLeft + cheekSquintRight) / 2 — Duchenne marker
  ts: number
  landmarks?: FaceLandmark[]  // 478 MediaPipe face mesh points
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
  charEntryTime: number   // ms since previous input (or phrase start for first char)
  dwellDuration: number | null
}

// Continuous time-series sample recorded at ~10 Hz during active experiment
export interface RawSample {
  sessionId: string
  conditionIndex: number
  phraseIndex: number
  charIndex: number
  ts: number
  // Face
  mouthSmile: number
  cheekSquint: number   // Duchenne marker (eyeSquint-based)
  smileScore: number
  // Gaze
  gazeX: number
  gazeY: number
  eyeOpen: boolean
}

export interface PhraseEvent {
  sessionId: string
  conditionIndex: number
  layout: Layout
  inputMethod: InputMethod
  phraseIndex: number
  phraseText: string
  phraseStartTime: number
  phraseEndTime: number
  durationMs: number
  wpm: number             // (phraseText.length / 5) / (durationMs / 60000)
  totalInputs: number     // all key presses including backspace
  backspaceCount: number
  correctChars: number
  errorRate: number       // errors / totalInputs excluding backspace
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
