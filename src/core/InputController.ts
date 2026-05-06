import type { GazePoint, FaceEvent, InputFiredEvent, InputMethod } from '../types'
import { DWELL_MS, BLINK_MIN_MS, BLINK_MAX_MS, BLINK_COOLDOWN_MS, SMILE_HOLD_MS, SMILE_LOCK_MS, CANDIDATE_DWELL_MS } from '../types'

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
  private blinkCandidateKey: string | null = null
  private blinkCandidateGaze: GazePoint | null = null
  private blinkCooldownUntil: number = 0
  private lastEyeOpen: boolean = true
  private blinkDwellTimer: ReturnType<typeof setTimeout> | null = null
  private blinkReadyKey: string | null = null
  private blinkReadyGaze: GazePoint | null = null

  // Smile
  private smileStart: number | null = null
  private smileLockTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private method: InputMethod,
    private smileThreshold: number = 0.6,
    private blinkMinMs: number = BLINK_MIN_MS,
    private blinkMaxMs: number = BLINK_MAX_MS,
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

    if (this.method === 'blink') {
      if (this.blinkDwellTimer) clearTimeout(this.blinkDwellTimer)
      this.blinkReadyKey = null
      this.blinkReadyGaze = null
      this.blinkDwellTimer = setTimeout(() => {
        this.blinkReadyKey = key
        this.blinkReadyGaze = gaze
      }, CANDIDATE_DWELL_MS)
    }

    if (this.method === 'smile') {
      if (this.smileLockTimer) clearTimeout(this.smileLockTimer)
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
    if (this.method === 'blink') {
      if (this.blinkDwellTimer) { clearTimeout(this.blinkDwellTimer); this.blinkDwellTimer = null }
      if (this.blinkReadyKey === key) { this.blinkReadyKey = null; this.blinkReadyGaze = null }
    }
    if (this.method === 'smile') {
      if (this.smileLockTimer) {
        clearTimeout(this.smileLockTimer)
        this.smileLockTimer = null
      }
      if (this.lockedKey === key) {
        this.lockedKey = null
        this.lockedGaze = null
        this.smileStart = null
      }
    }
  }

  // Called with Tobii eye_open data or mouse button simulation (left/right click).
  feedEyeOpen(eyeOpen: boolean) {
    if (this.method !== 'blink') return
    this.processEyeOpen(eyeOpen)
  }

  private processEyeOpen(eyeOpen: boolean) {
    const now = Date.now()
    const wasOpen = this.lastEyeOpen
    this.lastEyeOpen = eyeOpen

    if (!eyeOpen && wasOpen && now >= this.blinkCooldownUntil) {
      this.blinkStart = now
      // Lock candidate at blink start using the pre-dwelled ready key
      this.blinkCandidateKey = this.blinkReadyKey
      this.blinkCandidateGaze = this.blinkReadyGaze
    } else if (eyeOpen && !wasOpen && this.blinkStart !== null) {
      const dur = now - this.blinkStart
      if (dur >= this.blinkMinMs && dur < this.blinkMaxMs && this.blinkCandidateKey && this.blinkCandidateGaze) {
        this.blinkCooldownUntil = now + BLINK_COOLDOWN_MS
        this.fire(this.blinkCandidateKey, this.blinkCandidateGaze, null, dur)
      }
      this.blinkStart = null
      this.blinkCandidateKey = null
      this.blinkCandidateGaze = null
    }
  }

  feedFace(face: FaceEvent) {
    this.lastFace = face
    const now = Date.now()

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

  setSmileThreshold(v: number) {
    this.smileThreshold = v
  }

  setBlinkTiming(minMs: number, maxMs: number) {
    this.blinkMinMs = minMs
    this.blinkMaxMs = maxMs
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

  getFocusedKey(): string | null {
    return this.focusedKey
  }

  getCandidateKey(): string | null {
    if (this.method === 'blink')  return this.blinkCandidateKey ?? this.blinkReadyKey
    if (this.method === 'smile')  return this.lockedKey
    return this.focusedKey
  }

  isCandidateLocked(): boolean {
    if (this.method === 'blink') return this.blinkCandidateKey !== null
    if (this.method === 'smile') return this.lockedKey !== null
    return false
  }

  private fire(key: string, gaze: GazePoint, dwellDuration: number | null, blinkDuration: number | null = null) {
    const face = this.lastFace
    const event: InputFiredEvent = {
      key,
      gazeX: gaze.x,
      gazeY: gaze.y,
      blinkLeft:       face?.blinkLeft       ?? 0,
      blinkRight:      face?.blinkRight      ?? 0,
      blinkDuration,
      mouthSmileLeft:  face?.mouthSmileLeft  ?? 0,
      mouthSmileRight: face?.mouthSmileRight ?? 0,
      eyeSquintLeft:   face?.eyeSquintLeft   ?? 0,
      eyeSquintRight:  face?.eyeSquintRight  ?? 0,
      smileScore:      face?.smileScore      ?? 0,
      dwellDuration,
      ts: Date.now(),
    }
    for (const cb of this.callbacks) cb(event)
  }
}
