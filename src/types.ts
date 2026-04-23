export type Layout = 'qwerty' | 'opti'
export type InputMethod = 'dwell' | 'blink' | 'smile'
export type Language = 'zh' | 'ja' | 'en'
export type AppPage =
  | 'debug'
  | 'experimenter-config'
  | 'welcome'
  | 'typing-test'
  | 'tutorial'
  | 'experiment'
  | 'survey'

export interface ConditionConfig {
  layout: Layout
  inputMethod: InputMethod
}

export interface ExperimenterConfig {
  experimenterName: string
  conditionOrder: ConditionConfig[]
  startConditionIndex: number   // 0-based
  startPhraseIndex: number      // 0-based
  phrasesPerCondition: number   // default 15
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
  smileScore: number      // 0–1, weighted combination of mouth corners + cheek squint
  mouthSmile: number      // 0–1, (mouthSmileLeft + mouthSmileRight) / 2
  mouthSmileLeft: number  // 0–1, left mouth corner rise
  mouthSmileRight: number // 0–1, right mouth corner rise
  cheekSquint: number     // 0–1, Duchenne marker (max of eyeSquint avg, cheekSquint avg)
  eyeSquintLeft: number   // 0–1, lower eyelid rise — Duchenne smile marker
  eyeSquintRight: number  // 0–1
  blinkLeft: number       // 0–1, eyeBlinkLeft blendshape (0=open, 1=closed)
  blinkRight: number      // 0–1, eyeBlinkRight blendshape
  ts: number
  landmarks?: FaceLandmark[]  // 478 MediaPipe face mesh points
}

export interface InputFiredEvent {
  key: string
  gazeX: number
  gazeY: number
  blinkLeft: number
  blinkRight: number
  blinkDuration: number | null  // ms blink was held; only set for blink method
  mouthSmileLeft: number
  mouthSmileRight: number
  eyeSquintLeft: number
  eyeSquintRight: number
  smileScore: number
  dwellDuration: number | null
  ts: number
}

export type EventLogType =
  | 'experiment_start'
  | 'phrase_show'
  | 'char_input'
  | 'condition_survey'
  | 'final_survey'

export interface EventLog {
  sessionId: string
  ts: number
  type: EventLogType
  description: string
  // context — present on every entry
  participantId?: string
  layout?: Layout
  isTutorial?: boolean
  // char_input only:
  gazeX?: number
  gazeY?: number
  smileScore?: number
  mouthSmileLeft?: number
  mouthSmileRight?: number
  eyeSquintLeft?: number
  eyeSquintRight?: number
  blinkDuration?: number | null
  inputMethod?: InputMethod
  key?: string
  isCorrect?: boolean
  // config snapshot — present on experiment_start config entry only:
  experimenterName?: string
  conditionOrder?: string       // JSON.stringify(ConditionConfig[])
  startConditionIndex?: number
  startPhraseIndex?: number
  phrasesPerCondition?: number
  gazeMode?: 'tobii' | 'mouse'
  language?: Language
  // condition_survey (NASA-TLX, 1–7 each):
  tlxMental?: number
  tlxPhysical?: number
  tlxTemporal?: number
  tlxPerformance?: number
  tlxEffort?: number
  tlxHappiness?: number
  // condition_survey smile-specific (1–5, only when inputMethod === 'smile'):
  smileNaturalness?: number
  smileEmbarrassment?: number
  // final_survey:
  panasAnswers?: string    // JSON.stringify(number[20]), values 1–5
  preferenceRank?: string  // JSON.stringify(InputMethod[3]), best→worst
  age?: number
  gender?: string          // 'male' | 'female' | 'other' | 'prefer_not'
  hasEyeCondition?: boolean
}

// Phrases per condition (6 conditions × 15 = 90 total, non-overlapping across conditions)
export const PHRASES_PER_CONDITION = 15

// Dwell time in ms
export const DWELL_MS = 800
// Blink min duration in ms (shorter = accidental, ignore)
export const BLINK_MIN_MS = 150
// Blink max duration in ms (longer = natural blink, ignore)
export const BLINK_MAX_MS = 300
// Blink cooldown in ms
export const BLINK_COOLDOWN_MS = 500
// Smile trigger duration in ms
export const SMILE_HOLD_MS = 300
// Smile position lock dwell in ms
export const SMILE_LOCK_MS = 200
