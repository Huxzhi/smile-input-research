import { describe, it, expect, beforeEach } from 'vitest'
import { DataStore } from '../../src/core/DataStore'
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
