import type { EventLog } from '../types'
import { SurveyForm } from '../components/SurveyForm'
import { FINAL_SURVEY } from '../surveys/finalSurvey'
import type { SurveyAnswers } from '../surveys/types'

interface Props {
  sessionId: string
  participantId: string
  addLog: (log: EventLog) => void
  onNext: () => void
}

export function SurveyPage({ sessionId, participantId, addLog, onNext }: Props) {
  const handleSubmit = (answers: SurveyAnswers) => {
    const tamPU = {
      pu1: answers.pu1 as number,
      pu2: answers.pu2 as number,
      pu3: answers.pu3 as number,
    }
    const tamPEOU = {
      eou1: answers.eou1 as number,
      eou2: answers.eou2 as number,
      eou3: answers.eou3 as number,
    }

    addLog({
      sessionId,
      participantId,
      ts: Date.now(),
      type: 'final_survey',
      description: 'Final survey completed',
      panasFinalAnswers: JSON.stringify(answers.panas_post),
      tamPU:             JSON.stringify(tamPU),
      tamPEOU:           JSON.stringify(tamPEOU),
      preferenceRank:    JSON.stringify(answers.preference),
    })
    onNext()
  }

  return (
    <SurveyForm
      title="实验结束问卷"
      questions={FINAL_SURVEY}
      submitLabel="提交"
      onSubmit={handleSubmit}
    />
  )
}
