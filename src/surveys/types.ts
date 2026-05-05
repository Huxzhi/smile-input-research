export type QuestionDef =
  | { id: string; type: 'text';        label: string; placeholder?: string }
  | { id: string; type: 'likert';      label: string; points: 5 | 7; lo: string; hi: string }
  | { id: string; type: 'score100';    label: string; subLabel?: string }
  | { id: string; type: 'radio';       label: string; options: { value: string; label: string }[] }
  | { id: string; type: 'panas_batch'; items: string[] }
  | { id: string; type: 'rank';        label: string; items: { value: string; label: string }[] }

export type SurveyAnswer = string | number | number[] | string[]
export type SurveyAnswers = Record<string, SurveyAnswer>
