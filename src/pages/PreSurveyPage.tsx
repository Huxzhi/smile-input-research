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

const CACHE_KEY = (pid: string) => `presurv_${pid}`

function loadCache(participantId: string): Partial<SurveyAnswers> {
  try {
    const raw = localStorage.getItem(CACHE_KEY(participantId))
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveCache(participantId: string, answers: SurveyAnswers) {
  try {
    localStorage.setItem(CACHE_KEY(participantId), JSON.stringify(answers))
  } catch {
    // localStorage quota exceeded or unavailable — silently ignore
  }
}

export function PreSurveyPage({ sessionId, participantId, addLog, onNext }: Props) {
  const cached = loadCache(participantId)
  const hasCached = Object.keys(cached).length > 0

  const handleSubmit = (answers: SurveyAnswers) => {
    saveCache(participantId, answers)
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
      subtitle={hasCached ? `已为 P${participantId} 自动填入上次的答案，请确认后继续` : '请在开始实验前填写以下信息'}
      questions={PRE_SURVEY}
      initialAnswers={cached}
      submitLabel="开始实验"
      onSubmit={handleSubmit}
    />
  )
}
