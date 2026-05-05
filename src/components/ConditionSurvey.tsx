import { useI18n } from '../i18n'
import type { Layout, InputMethod } from '../types'
import { SurveyForm } from './SurveyForm'
import { getConditionSurveyQuestions } from '../surveys/conditionSurvey'
import type { SurveyAnswers } from '../surveys/types'

export interface ConditionSurveyAnswers {
  tlxMental: number
  tlxPhysical: number
  tlxTemporal: number
  tlxPerformance: number
  tlxEffort: number
  tlxHappiness: number
  fatigue: number
  smileNaturalness: number | null
  smileEmbarrassment: number | null
}

interface Props {
  conditionIndex: number
  participantId: string
  layout: Layout
  inputMethod: InputMethod
  onSubmit: (answers: ConditionSurveyAnswers) => void
}

const METHOD_ZH: Record<InputMethod, string> = { dwell: '注视', blink: '眨眼', smile: '微笑' }

function cacheKey(pid: string, idx: number) {
  return `condition_survey_${pid}_${idx}`
}

function loadCache(pid: string, idx: number): Partial<SurveyAnswers> {
  try {
    const raw = localStorage.getItem(cacheKey(pid, idx))
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

export function ConditionSurvey({ conditionIndex, participantId, layout, inputMethod, onSubmit }: Props) {
  const { t } = useI18n()
  const initialAnswers = loadCache(participantId, conditionIndex)

  const handleSubmit = (raw: SurveyAnswers) => {
    try { localStorage.setItem(cacheKey(participantId, conditionIndex), JSON.stringify(raw)) } catch { /* quota */ }
    onSubmit({
      tlxMental:          raw.tlxMental      as number,
      tlxPhysical:        raw.tlxPhysical    as number,
      tlxTemporal:        raw.tlxTemporal    as number,
      tlxPerformance:     raw.tlxPerformance as number,
      tlxEffort:          raw.tlxEffort      as number,
      tlxHappiness:       raw.tlxHappiness   as number,
      fatigue:            raw.fatigue        as number,
      smileNaturalness:   inputMethod === 'smile' ? (raw.smileNaturalness as number) : null,
      smileEmbarrassment: inputMethod === 'smile' ? (raw.smileEmbarrassment as number) : null,
    })
  }

  return (
    <SurveyForm
      title={t('conditionSurvey.title') as string}
      subtitle={t('conditionSurvey.subtitle', {
        index: String(conditionIndex + 1),
        layout: layout.toUpperCase(),
        method: METHOD_ZH[inputMethod],
      }) as string}
      questions={getConditionSurveyQuestions(inputMethod)}
      initialAnswers={initialAnswers}
      submitLabel={t('conditionSurvey.submit') as string}
      onSubmit={handleSubmit}
    />
  )
}
