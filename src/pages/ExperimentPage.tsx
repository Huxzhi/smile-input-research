import { useState, useEffect, useRef } from 'react'
import { useI18n } from '../i18n'
import type { SessionState } from '../App'
import { METHOD_ZH } from '../types'
import type { GazePoint, FaceEvent, EventLog } from '../types'
import { centerColumn } from '../styles'
import { InputController } from '../core/InputController'
import { useGazeHitTest } from '../core/useGazeHitTest'
import { ExperimentManager } from '../core/ExperimentManager'
import { QwertyKeyboard, computeQwertyKeySize } from '../components/keyboards/QwertyKeyboard'
import { OptiKeyboard, computeOptiKeySize } from '../components/keyboards/OptiKeyboard'
import { ConditionSurvey, type ConditionSurveyAnswers } from '../components/ConditionSurvey'
import { CandidatePanel } from '../components/CandidatePanel'

type ExperimentPhase = 'running' | 'condition-survey' | 'resting'

interface Props {
  session: SessionState
  gaze: GazePoint | null
  faceEvent: FaceEvent | null
  toPixel: (g: GazePoint) => { x: number; y: number }
  addLog: (log: EventLog) => void
  onNext: () => void
  onConditionChange: (index: number) => void
}

const REST_SECS = 60

export function ExperimentPage({
  session, gaze, faceEvent, toPixel, addLog: addLogProp, onNext, onConditionChange,
}: Props) {
  const { t } = useI18n()
  const [phase, setPhase] = useState<ExperimentPhase>('running')
  const [restSecsLeft, setRestSecsLeft] = useState(REST_SECS)
  const [conditionIndex, setConditionIndex] = useState(session.experimenterConfig.startConditionIndex)
  const [, forceUpdate] = useState(0)

  const managerRef    = useRef(new ExperimentManager(session.participantId, session.experimenterConfig))
  const controllerRef = useRef<InputController | null>(null)

  const manager   = managerRef.current
  const ppc       = manager.getPhrasesPerCondition()
  const condition = manager.getConditionOrder()[conditionIndex]

  const { handleKeyRect, resetHitTracking } = useGazeHitTest({
    gaze, faceEvent, toPixel, controllerRef,
  })

  const addLog = (entry: Omit<EventLog, 'sessionId' | 'participantId'>) => {
    addLogProp({ ...entry, sessionId: session.sessionId, participantId: session.participantId })
  }

  useEffect(() => {
    onConditionChange(conditionIndex)
  }, [conditionIndex, onConditionChange])

  useEffect(() => {
    const ctrl = controllerRef.current
    if (!ctrl) return
    ctrl.setSmileThreshold(session.smileThreshold)
  }, [session.smileThreshold])

  useEffect(() => {
    const ctrl = controllerRef.current
    if (!ctrl) return
    ctrl.setBlinkTiming(session.blinkMinMs ?? 150, session.blinkMaxMs ?? 300)
  }, [session.blinkMinMs, session.blinkMaxMs])

  useEffect(() => {
    controllerRef.current = new InputController(condition.inputMethod, session.smileThreshold, session.blinkMinMs ?? 150, session.blinkMaxMs ?? 300)
    const ctrl = controllerRef.current
    const isFirst = conditionIndex === session.experimenterConfig.startConditionIndex
    manager.startCondition(conditionIndex, isFirst ? session.experimenterConfig.startPhraseIndex : 0)
    resetHitTracking()

    const now = Date.now()
    addLog({ ts: now, type: 'experiment_start', description: `条件 ${conditionIndex + 1}: ${condition.layout.toUpperCase()} / ${condition.inputMethod}`, layout: condition.layout, isTutorial: false })
    addLog({ ts: now + 1, type: 'phrase_show', description: `短语 ${manager.getPhraseIndex() + 1}/${ppc}: "${manager.getCurrentPhrase()}"`, layout: condition.layout, isTutorial: false })

    const unsub = ctrl.onInput((fired) => {
      const now = fired.ts
      const inputChar = fired.key === 'SPACE' ? ' ' : fired.key.toLowerCase()
      const record = manager.recordInput(inputChar)

      addLog({
        ts: now,
        type: 'char_input',
        description: `"${fired.key}" → 目标"${record.targetChar}" ${record.isCorrect ? '✓' : '✗'}`,
        layout:          condition.layout,
        isTutorial:      false,
        gazeX:           fired.gazeX,
        gazeY:           fired.gazeY,
        smileScore:      fired.smileScore,
        mouthSmileLeft:  fired.mouthSmileLeft,
        mouthSmileRight: fired.mouthSmileRight,
        eyeSquintLeft:   fired.eyeSquintLeft,
        eyeSquintRight:  fired.eyeSquintRight,
        blinkDuration:   fired.blinkDuration,
        inputMethod:     condition.inputMethod,
        key:             fired.key,
        isCorrect:       record.isCorrect,
      })

      if (manager.isPhraseComplete()) {
        manager.nextPhrase()
        if (!manager.isConditionComplete()) {
          addLog({ ts: Date.now(), type: 'phrase_show', description: `短语 ${manager.getPhraseIndex() + 1}/${ppc}: "${manager.getCurrentPhrase()}"`, layout: condition.layout, isTutorial: false })
        }
      }

      forceUpdate(n => n + 1)

      if (manager.isConditionComplete()) {
        if (conditionIndex + 1 >= manager.getConditionOrder().length) {
          onNext()
        } else {
          setPhase('condition-survey')
        }
      }
    })

    return unsub
  }, [conditionIndex]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (phase !== 'resting') return
    const timer = setInterval(() => {
      setRestSecsLeft(s => {
        if (s <= 1) { clearInterval(timer); setPhase('running'); setConditionIndex(i => i + 1); return REST_SECS }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [phase])

  const handleSurveySubmit = (answers: ConditionSurveyAnswers) => {
    addLog({
      ts: Date.now(),
      type: 'condition_survey',
      description: `条件 ${conditionIndex + 1} 问卷: ${condition.layout} / ${condition.inputMethod}`,
      layout: condition.layout,
      inputMethod: condition.inputMethod,
      tlxMental:      answers.tlxMental,
      tlxPhysical:    answers.tlxPhysical,
      tlxTemporal:    answers.tlxTemporal,
      tlxPerformance: answers.tlxPerformance,
      tlxEffort:      answers.tlxEffort,
      tlxHappiness:   answers.tlxHappiness,
      fatigue:            answers.fatigue,
      smileNaturalness:   answers.smileNaturalness ?? undefined,
      smileEmbarrassment: answers.smileEmbarrassment ?? undefined,
    })
    setRestSecsLeft(REST_SECS)
    setPhase('resting')
  }

  const ctrl       = controllerRef.current
  const targetChar = manager.getTargetChar()
  const phrase     = manager.getCurrentPhrase()
  const charIndex  = manager.getCharIndex()

  const CANDIDATE_W = 88  // panel 72 + gap 16
  const contentW = window.innerWidth * 0.80
  const kbAvailW = contentW - 32 - CANDIDATE_W
  const kbAvailH = (window.innerHeight - 200) * 0.78
  const keySize  = condition.layout === 'qwerty'
    ? computeQwertyKeySize(kbAvailW, kbAvailH)
    : computeOptiKeySize(kbAvailW, kbAvailH)

  if (phase === 'condition-survey') {
    return (
      <ConditionSurvey
        conditionIndex={conditionIndex}
        participantId={session.participantId}
        layout={condition.layout}
        inputMethod={condition.inputMethod}
        onSubmit={handleSurveySubmit}
      />
    )
  }

  if (phase === 'resting') {
    return (
      <div style={centerColumn}>
        <h2 style={{ color: '#f1fa8c' }}>{t('experiment.rest')}</h2>
        <p style={{ color: '#aaa', fontSize: 18 }}>
          {t('experiment.restMessage', { seconds: String(restSecsLeft) })}
        </p>
        <button
          onClick={() => { setPhase('running'); setConditionIndex(i => i + 1) }}
          style={actionBtn}
        >
          {t('experiment.restSkip')}
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 20, gap: 12 }}>
      <span style={{ fontSize: 12, color: '#555', letterSpacing: 1 }}>
        {t('experiment.condition', { index: String(conditionIndex + 1) })}
        {' — '}
        {condition.layout.toUpperCase()} / {METHOD_ZH[condition.inputMethod]}
        {' — '}
        短语 {manager.getPhraseIndex() + 1}/{ppc}
      </span>

      <div style={{ fontSize: 20, letterSpacing: 3, fontFamily: 'monospace', padding: '10px 20px', background: '#111', borderRadius: 6 }}>
        {phrase.split('').map((ch, i) => (
          <span key={i} style={{
            color: i < charIndex ? '#50fa7b' : i === charIndex ? '#fff' : '#444',
            fontWeight: i === charIndex ? 'bold' : 'normal',
            textDecoration: i === charIndex ? 'underline' : 'none',
          }}>
            {ch === ' ' ? ' ' : ch}
          </span>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <CandidatePanel ctrl={ctrl} inputMethod={condition.inputMethod} />
        {ctrl && (
          condition.layout === 'qwerty'
            ? <QwertyKeyboard controller={ctrl} gaze={gaze} targetChar={targetChar} onKeyRect={handleKeyRect} keySize={keySize} />
            : <OptiKeyboard   controller={ctrl} gaze={gaze} targetChar={targetChar} onKeyRect={handleKeyRect} keySize={keySize} />
        )}
      </div>
    </div>
  )
}

const actionBtn: React.CSSProperties = {
  padding: '12px 32px', borderRadius: 8, border: 'none',
  background: '#5a7aff', color: '#fff', fontSize: 16, cursor: 'pointer',
}
