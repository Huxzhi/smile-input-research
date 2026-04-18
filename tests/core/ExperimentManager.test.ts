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
