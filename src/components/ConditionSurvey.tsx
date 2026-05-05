import { useI18n } from '../i18n'
import { METHOD_ZH } from '../types'
import type { Layout, InputMethod } from '../types'
import { SurveyForm } from './SurveyForm'
import { getConditionSurveyQuestions } from '../surveys/conditionSurvey'
import type { SurveyAnswers } from '../surveys/types'
import { loadJSON, saveJSON } from '../utils/storage'

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

const cacheKey = (pid: string, idx: number) => `condition_survey_${pid}_${idx}`

export function ConditionSurvey({ conditionIndex, participantId, layout, inputMethod, onSubmit }: Props) {
  const { t } = useI18n()

  const handleSubmit = (raw: SurveyAnswers) => {
    saveJSON(cacheKey(participantId, conditionIndex), raw)
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
      initialAnswers={loadJSON(cacheKey(participantId, conditionIndex), {})}
      submitLabel={t('conditionSurvey.submit') as string}
      onSubmit={handleSubmit}
    />
  )
}
