import type { QuestionDef } from './types'
import type { InputMethod } from '../types'

const SMILE_SCALE_LO = '完全不同意'
const SMILE_SCALE_HI = '完全同意'

export function getConditionSurveyQuestions(inputMethod: InputMethod): QuestionDef[] {
  const questions: QuestionDef[] = [
    { id: 'tlxMental',      type: 'likert', points: 7, label: '脑力需求',   lo: '极低', hi: '极高' },
    { id: 'tlxPhysical',    type: 'likert', points: 7, label: '体力需求',   lo: '极低', hi: '极高' },
    { id: 'tlxTemporal',    type: 'likert', points: 7, label: '时间压力',   lo: '极低', hi: '极高' },
    { id: 'tlxPerformance', type: 'likert', points: 7, label: '表现满意度', lo: '非常满意', hi: '非常不满意' },
    { id: 'tlxEffort',      type: 'likert', points: 7, label: '努力程度',   lo: '极低', hi: '极高' },
    { id: 'tlxHappiness',   type: 'likert', points: 7, label: '愉悦感',     lo: '极低', hi: '极高' },
    { id: 'fatigue', type: 'score100', label: '当前疲劳程度', subLabel: '0 = 完全不疲劳　·　100 = 极度疲劳' },
  ]

  if (inputMethod === 'smile') {
    questions.push(
      { id: 'smileNaturalness',   type: 'likert', points: 5, label: '用微笑选字让我感到不自然',         lo: SMILE_SCALE_LO, hi: SMILE_SCALE_HI },
      { id: 'smileEmbarrassment', type: 'likert', points: 5, label: '如果在公开场合使用，我会感到尴尬', lo: SMILE_SCALE_LO, hi: SMILE_SCALE_HI },
    )
  }

  return questions
}
