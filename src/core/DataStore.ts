import { openDB, type IDBPDatabase } from 'idb'
import type { Session, ExperimentEvent, PhraseEvent, RawSample, SurveyResult } from '../types'

const DB_NAME = 'smile-input-research'
const DB_VERSION = 3

export class DataStore {
  private db: IDBPDatabase | null = null

  async init() {
    this.db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore('sessions', { keyPath: 'id' })
          db.createObjectStore('events', { autoIncrement: true })
          db.createObjectStore('surveys', { keyPath: 'sessionId' })
        }
        if (oldVersion < 2) {
          db.createObjectStore('phrase_events', { autoIncrement: true })
        }
        if (oldVersion < 3) {
          db.createObjectStore('raw_samples', { autoIncrement: true })
        }
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

  async savePhraseEvent(event: PhraseEvent) {
    await this.db!.add('phrase_events', event)
  }

  async getPhraseEvents(sessionId: string): Promise<PhraseEvent[]> {
    const all: PhraseEvent[] = await this.db!.getAll('phrase_events')
    return all.filter(e => e.sessionId === sessionId)
  }

  async saveRawSample(sample: RawSample) {
    await this.db!.add('raw_samples', sample)
  }

  async getRawSamples(sessionId: string): Promise<RawSample[]> {
    const all: RawSample[] = await this.db!.getAll('raw_samples')
    return all.filter(s => s.sessionId === sessionId)
  }

  async saveSurvey(survey: SurveyResult) {
    await this.db!.put('surveys', survey)
  }

  async getSurvey(sessionId: string): Promise<SurveyResult | undefined> {
    return this.db!.get('surveys', sessionId)
  }

  async exportCSV(sessionId: string): Promise<{ sessions: string; phrases: string; events: string; raw: string; surveys: string }> {
    const [session, phraseEvents, events, rawSamples, survey] = await Promise.all([
      this.getSession(sessionId),
      this.getPhraseEvents(sessionId),
      this.getEvents(sessionId),
      this.getRawSamples(sessionId),
      this.getSurvey(sessionId),
    ])

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
      phrases:  toCSV(phraseEvents),
      events:   toCSV(events),
      raw:      toCSV(rawSamples),
      surveys:  toCSV(survey ? [survey] : []),
    }
  }
}
