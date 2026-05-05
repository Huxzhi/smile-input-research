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
  layout: Layout
  inputMethod: InputMethod
  onSubmit: (answers: ConditionSurveyAnswers) => void
}

const METHOD_ZH: Record<InputMethod, string> = { dwell: '注视', blink: '眨眼', smile: '微笑' }

export function ConditionSurvey({ conditionIndex, layout, inputMethod, onSubmit }: Props) {
  const { t } = useI18n()

  const handleSubmit = (raw: SurveyAnswers) => {
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
      submitLabel={t('conditionSurvey.submit') as string}
      onSubmit={handleSubmit}
    />
  )
}
