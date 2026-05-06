import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { InputController } from '../../src/core/InputController'
import { DWELL_MS, BLINK_MAX_MS, BLINK_COOLDOWN_MS, SMILE_HOLD_MS, SMILE_LOCK_MS, CANDIDATE_DWELL_MS } from '../../src/types'

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

  it('fires on blink under BLINK_MAX_MS after candidate dwell', () => {
    const ctrl = new InputController('blink')
    const fired: string[] = []
    ctrl.onInput((e) => fired.push(e.key))
    ctrl.gazeEnterKey('B', { x: 0.3, y: 0.4, ts: 0 })
    vi.advanceTimersByTime(CANDIDATE_DWELL_MS)  // key becomes ready candidate

    ctrl.feedEyeOpen(false)           // eye closes (Tobii/mouse)
    vi.advanceTimersByTime(250)
    ctrl.feedEyeOpen(true)            // eye opens → blink duration 250ms, within range
    expect(fired).toEqual(['B'])
  })

  it('does not fire blink before candidate dwell completes', () => {
    const ctrl = new InputController('blink')
    const fired: string[] = []
    ctrl.onInput((e) => fired.push(e.key))
    ctrl.gazeEnterKey('B', { x: 0.3, y: 0.4, ts: 0 })
    vi.advanceTimersByTime(CANDIDATE_DWELL_MS - 100)  // not ready yet

    ctrl.feedEyeOpen(false)
    vi.advanceTimersByTime(150)
    ctrl.feedEyeOpen(true)
    expect(fired).toHaveLength(0)
  })

  it('ignores blink over BLINK_MAX_MS (natural blink)', () => {
    const ctrl = new InputController('blink')
    const fired: string[] = []
    ctrl.onInput((e) => fired.push(e.key))
    ctrl.gazeEnterKey('B', { x: 0.3, y: 0.4, ts: 0 })
    vi.advanceTimersByTime(CANDIDATE_DWELL_MS)

    ctrl.feedEyeOpen(false)
    vi.advanceTimersByTime(BLINK_MAX_MS + 50)
    ctrl.feedEyeOpen(true)
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
