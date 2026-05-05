import type { EventLog } from '../types'
import { SurveyForm } from '../components/SurveyForm'
import { PRE_SURVEY } from '../surveys/preSurvey'
import type { SurveyAnswers } from '../surveys/types'

interface Props {
  sessionId: string
  participantId: string
  addLog: (log: EventLog) => void
  onNext: () => void
}

export function PreSurveyPage({ sessionId, participantId, addLog, onNext }: Props) {
  const handleSubmit = (answers: SurveyAnswers) => {
    addLog({
      sessionId,
      participantId,
      ts: Date.now(),
      type: 'pre_survey',
      description: 'Pre-experiment survey completed',
      age:                  parseInt(answers.age as string) || undefined,
      gender:               answers.gender as string,
      eyeTrackerExperience: answers.eyeTracker as string,
      hasEyeCondition:      answers.eyeCondition === 'yes',
      panasPreAnswers:      JSON.stringify(answers.panas_pre),
    })
    onNext()
  }

  return (
    <SurveyForm
      title="实验前问卷"
      subtitle="请在开始实验前填写以下信息"
      questions={PRE_SURVEY}
      submitLabel="开始实验"
      onSubmit={handleSubmit}
    />
  )
}
