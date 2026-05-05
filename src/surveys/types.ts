export type QuestionDef =
  | { id: string; type: 'text';        label: string; placeholder?: string }
  | { id: string; type: 'likert';      label: string; points: 5 | 7; lo: string; hi: string }
  | { id: string; type: 'score100';    label: string; subLabel?: string }
  | { id: string; type: 'radio';       label: string; options: { value: string; label: string }[] }
  | { id: string; type: 'panas_batch'; items: string[] }
  | { id: string; type: 'rank';        label: string; items: { value: string; label: string }[] }

export type SurveyAnswer = string | number | number[] | string[]
export type SurveyAnswers = Record<string, SurveyAnswer>

export function isComplete(q: QuestionDef, val: SurveyAnswer | undefined): boolean {
  if (val === undefined) return false
  switch (q.type) {
    case 'text':        return (val as string).trim() !== ''
    case 'likert':      return (val as number) > 0
    case 'score100':    return true
    case 'radio':       return (val as string) !== ''
    case 'panas_batch': return (val as number[]).every(v => v > 0)
    case 'rank':        return true
  }
}
