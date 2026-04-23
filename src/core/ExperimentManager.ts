import type { ConditionConfig, InputMethod, Layout, ExperimenterConfig } from '../types'
import { PHRASES_PER_CONDITION } from '../types'
import { PHRASES } from '../data/phrases'

const NUM_CONDITIONS = 6
const METHOD_ORDERS: InputMethod[][] = [
  ['smile', 'dwell', 'blink'],  // mod 0
  ['dwell', 'blink', 'smile'],  // mod 1
  ['blink', 'smile', 'dwell'],  // mod 2
]

export class ExperimentManager {
  private conditionOrder: ConditionConfig[]
  private conditionPhrases: string[][]
  private phrasesPerCondition: number
  private conditionIndex = 0
  private phraseIndex = 0
  private charIndex = 0

  constructor(private participantId: string, config?: ExperimenterConfig) {
    this.phrasesPerCondition = config?.phrasesPerCondition ?? PHRASES_PER_CONDITION
    this.conditionOrder = config?.conditionOrder ?? this.buildConditionOrder(participantId)
    this.conditionPhrases = this.buildConditionPhrases(participantId, this.phrasesPerCondition)
  }

  private buildConditionOrder(pid: string): ConditionConfig[] {
    const n = parseInt(pid, 10) || 1
    const firstLayout: Layout = n % 2 === 1 ? 'qwerty' : 'opti'
    const secondLayout: Layout = firstLayout === 'qwerty' ? 'opti' : 'qwerty'
    const methods = METHOD_ORDERS[n % 3]

    return [
      { layout: firstLayout,  inputMethod: methods[0] },
      { layout: firstLayout,  inputMethod: methods[1] },
      { layout: firstLayout,  inputMethod: methods[2] },
      { layout: secondLayout, inputMethod: methods[0] },
      { layout: secondLayout, inputMethod: methods[1] },
      { layout: secondLayout, inputMethod: methods[2] },
    ]
  }

  private buildConditionPhrases(pid: string, ppc: number): string[][] {
    const maxPpc = Math.floor(PHRASES.length / NUM_CONDITIONS)
    if (ppc > maxPpc) throw new Error(`phrasesPerCondition ${ppc} exceeds maximum ${maxPpc}`)
    const n = parseInt(pid, 10) || 1
    const totalNeeded = NUM_CONDITIONS * ppc
    // Offset varies per participant, stays within bounds
    const offset = (n * totalNeeded) % (PHRASES.length - totalNeeded)
    return Array.from({ length: NUM_CONDITIONS }, (_, i) =>
      PHRASES.slice(offset + i * ppc, offset + (i + 1) * ppc)
    )
  }

  getConditionOrder(): ConditionConfig[] {
    return this.conditionOrder
  }

  getPhrasesPerCondition(): number {
    return this.phrasesPerCondition
  }

  getCurrentCondition(): ConditionConfig {
    return this.conditionOrder[this.conditionIndex]
  }

  getConditionIndex(): number {
    return this.conditionIndex
  }

  startCondition(index: number, phraseIndex = 0) {
    this.conditionIndex = index
    this.phraseIndex = phraseIndex
    this.charIndex = 0
  }

  getCurrentPhrase(): string {
    return this.conditionPhrases[this.conditionIndex][this.phraseIndex]
  }

  getPhraseIndex(): number {
    return this.phraseIndex
  }

  getTargetChar(): string {
    const phrase = this.getCurrentPhrase()
    return phrase[this.charIndex] ?? ''
  }

  getCharIndex(): number {
    return this.charIndex
  }

  isPhraseComplete(): boolean {
    return this.charIndex >= this.getCurrentPhrase().length
  }

  isConditionComplete(): boolean {
    return this.phraseIndex >= this.phrasesPerCondition
  }

  isExperimentComplete(): boolean {
    return this.conditionIndex >= this.conditionOrder.length
  }

  recordInput(inputChar: string): { targetChar: string; inputChar: string; isCorrect: boolean } {
    const targetChar = this.getTargetChar()
    const isCorrect = inputChar === targetChar
    this.charIndex++
    return { targetChar, inputChar, isCorrect }
  }

  nextPhrase() {
    this.phraseIndex++
    this.charIndex = 0
  }

  advanceCondition() {
    this.conditionIndex++
    this.phraseIndex = 0
    this.charIndex = 0
  }
}
