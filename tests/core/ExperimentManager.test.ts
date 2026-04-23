import { describe, it, expect } from 'vitest'
import { ExperimentManager } from '../../src/core/ExperimentManager'
import type { ExperimenterConfig } from '../../src/types'

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
    // phrase 0 first char should match the actual phrase
    const phrase = mgr.getCurrentPhrase()
    expect(mgr.getTargetChar()).toBe(phrase[0])
  })

  it('advances to next char on input', () => {
    const mgr = new ExperimentManager('1')
    mgr.startCondition(0)
    const phrase = mgr.getCurrentPhrase()
    mgr.recordInput(phrase[0])
    expect(mgr.getTargetChar()).toBe(phrase[1])
  })

  it('detects phrase complete', () => {
    const mgr = new ExperimentManager('1')
    mgr.startCondition(0)
    const phrase = mgr.getCurrentPhrase()
    for (const ch of phrase) mgr.recordInput(ch)
    expect(mgr.isPhraseComplete()).toBe(true)
  })
})

describe('ExperimentManager — config override', () => {
  const mockConfig: ExperimenterConfig = {
    experimenterName: 'Tester',
    conditionOrder: [
      { layout: 'opti', inputMethod: 'blink' },
      { layout: 'opti', inputMethod: 'smile' },
      { layout: 'opti', inputMethod: 'dwell' },
      { layout: 'qwerty', inputMethod: 'blink' },
      { layout: 'qwerty', inputMethod: 'smile' },
      { layout: 'qwerty', inputMethod: 'dwell' },
    ],
    startConditionIndex: 0,
    startPhraseIndex: 0,
    phrasesPerCondition: 5,
  }

  it('uses conditionOrder from config instead of Latin square', () => {
    const mgr = new ExperimentManager('1', mockConfig)
    expect(mgr.getConditionOrder()[0]).toEqual({ layout: 'opti', inputMethod: 'blink' })
  })

  it('uses phrasesPerCondition from config', () => {
    const mgr = new ExperimentManager('1', mockConfig)
    expect(mgr.getPhrasesPerCondition()).toBe(5)
  })

  it('isConditionComplete uses runtime phrasesPerCondition', () => {
    const mgr = new ExperimentManager('1', mockConfig)
    mgr.startCondition(0)
    const phrase = mgr.getCurrentPhrase()
    for (const ch of phrase) mgr.recordInput(ch)
    mgr.nextPhrase()
    // After 1 phrase, not complete (phrasesPerCondition=5)
    expect(mgr.isConditionComplete()).toBe(false)
  })

  it('startCondition with phraseIndex skips to that phrase', () => {
    const mgr = new ExperimentManager('1', mockConfig)
    mgr.startCondition(0, 2)
    expect(mgr.getPhraseIndex()).toBe(2)
  })

  it('without config, falls back to Latin square (backward compat)', () => {
    const mgr = new ExperimentManager('1')
    expect(mgr.getConditionOrder()[0].layout).toBe('qwerty')
    expect(mgr.getPhrasesPerCondition()).toBe(15)
  })
})
