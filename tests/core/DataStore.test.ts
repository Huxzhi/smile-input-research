import { describe, it, expect, beforeEach } from 'vitest'
import { DataStore } from '../../src/core/DataStore'
import type { EventLog } from '../../src/types'
import 'fake-indexeddb/auto'

const makeLog = (overrides?: Partial<EventLog>): EventLog => ({
  sessionId: 'session-1',
  ts: Date.now(),
  type: 'char_input',
  description: 'test log entry',
  ...overrides,
})

describe('DataStore', () => {
  it('saveLog + getLogs roundtrip', async () => {
    const store = new DataStore()
    await store.init()
    const log = makeLog({ sessionId: 'abc', description: 'hello' })
    await store.saveLog(log)
    const logs = await store.getLogs()
    expect(logs).toHaveLength(1)
    expect(logs[0].sessionId).toBe('abc')
    expect(logs[0].description).toBe('hello')
  })

  it('getRecentLogs(n) returns at most n entries in newest-first order', async () => {
    const store = new DataStore()
    await store.init()
    const first = makeLog({ ts: 1000, description: 'first' })
    const second = makeLog({ ts: 2000, description: 'second' })
    const third = makeLog({ ts: 3000, description: 'third' })
    await store.saveLog(first)
    await store.saveLog(second)
    await store.saveLog(third)

    const recent = await store.getRecentLogs(2)
    expect(recent).toHaveLength(2)
    // newest-first: third was inserted last, so it comes first
    expect(recent[0].description).toBe('third')
    expect(recent[1].description).toBe('second')
  })

  it('exportCSV returns a CSV string with headers from log fields', async () => {
    const store = new DataStore()
    await store.init()
    const log = makeLog({ sessionId: 's1', ts: 1000, type: 'experiment_start', description: 'start' })
    await store.saveLog(log)
    const csv = await store.exportCSV()
    const lines = csv.split('\n')
    expect(lines.length).toBeGreaterThanOrEqual(2)
    // First line is headers
    const headers = lines[0].split(',')
    expect(headers).toContain('sessionId')
    expect(headers).toContain('ts')
    expect(headers).toContain('type')
    expect(headers).toContain('description')
    // Data rows contain the saved sessionId
    expect(csv).toContain('s1')
  })
})
