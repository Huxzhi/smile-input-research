import type { ConditionConfig, InputMethod, Layout } from '../types'
import { PHRASES } from '../data/phrases'

const METHOD_ORDERS: InputMethod[][] = [
  ['smile', 'dwell', 'blink'],  // mod 0
  ['dwell', 'blink', 'smile'],  // mod 1
  ['blink', 'smile', 'dwell'],  // mod 2
]

export class ExperimentManager {
  private conditionOrder: ConditionConfig[]
  private conditionIndex = 0
  private phraseIndex = 0
  private charIndex = 0

  constructor(private participantId: string) {
    this.conditionOrder = this.buildConditionOrder(participantId)
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

  getConditionOrder(): ConditionConfig[] {
    return this.conditionOrder
  }

  getCurrentCondition(): ConditionConfig {
    return this.conditionOrder[this.conditionIndex]
  }

  getConditionIndex(): number {
    return this.conditionIndex
  }

  startCondition(index: number) {
    this.conditionIndex = index
    this.phraseIndex = 0
    this.charIndex = 0
  }

  getCurrentPhrase(): string {
    return PHRASES[this.phraseIndex]
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
    return this.phraseIndex >= PHRASES.length
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
