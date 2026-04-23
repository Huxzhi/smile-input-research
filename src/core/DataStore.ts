import { openDB, type IDBPDatabase } from 'idb'
import type { EventLog } from '../types'

const DB_NAME = 'smile-input-research'
const DB_VERSION = 1

export class DataStore {
  private db: IDBPDatabase | null = null

  async init() {
    this.db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore('logs', { autoIncrement: true })
      },
    })
  }

  async saveLog(log: EventLog) {
    await this.db!.add('logs', log)
  }

  async getLogs(): Promise<EventLog[]> {
    return this.db!.getAll('logs')
  }

  async getRecentLogs(n: number): Promise<EventLog[]> {
    const result: EventLog[] = []
    let cursor = await this.db!.transaction('logs').store.openCursor(null, 'prev')
    while (cursor && result.length < n) {
      result.push(cursor.value as EventLog)
      cursor = await cursor.continue()
    }
    return result  // newest-first, matches displayLogs prepend order
  }

  async exportCSV(): Promise<string> {
    const logs = await this.getLogs()
    if (!logs.length) return ''
    const headers = Object.keys(logs[0])
    const lines = logs.map(r =>
      Object.values(r).map(v => String(v ?? '')).join(',')
    )
    return [headers.join(','), ...lines].join('\n')
  }
}
