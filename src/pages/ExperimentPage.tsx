import { useState, useEffect, useRef } from 'react'
import { useI18n } from '../i18n'
import type { SessionState } from '../App'
import type { GazePoint, EventLog } from '../types'
import { InputController } from '../core/InputController'
import { useGazeInput } from '../core/useGazeInput'
import { ExperimentManager } from '../core/ExperimentManager'
import { GazeCursor } from '../components/GazeCursor'
import { FaceDebugPanel } from '../components/FaceDebugPanel'
import { QwertyKeyboard, computeQwertyKeySize } from '../components/keyboards/QwertyKeyboard'
import { OptiKeyboard, computeOptiKeySize } from '../components/keyboards/OptiKeyboard'
import { ConditionSurvey, type ConditionSurveyAnswers } from '../components/ConditionSurvey'

type ExperimentPhase = 'running' | 'condition-survey' | 'resting'

interface Props {
  session: SessionState
  addLog: (log: EventLog) => void
  onNext: () => void
}

const REST_SECS = 60
const SIDEBAR_W = 130

const METHOD_ZH: Record<string, string> = { dwell: '注视', smile: '微笑', blink: '眨眼' }

export function ExperimentPage({ session, addLog: addLogProp, onNext }: Props) {
  const { t } = useI18n()
  const [phase, setPhase] = useState<ExperimentPhase>('running')
  const [restSecsLeft, setRestSecsLeft] = useState(REST_SECS)
  const [conditionIndex, setConditionIndex] = useState(session.experimenterConfig.startConditionIndex)
  const [, forceUpdate] = useState(0)

  const managerRef = useRef(new ExperimentManager(session.participantId, session.experimenterConfig))
  const videoRef = useRef<HTMLVideoElement>(null)
  const cursorRef = useRef<HTMLDivElement>(null)
  const controllerRef = useRef<InputController | null>(null)

  const manager = managerRef.current
  const ppc = manager.getPhrasesPerCondition()
  const condition = manager.getConditionOrder()[conditionIndex]

  const { gaze, faceEvent, handleKeyRect, resetHitTracking } = useGazeInput({
    gazeMode: session.gazeMode,
    offsetX: session.gazeOffsetX ?? 0,
    offsetY: session.gazeOffsetY ?? 0,
    videoRef,
    cursorRef,
    controllerRef,
  })

  const addLog = (entry: Omit<EventLog, 'sessionId' | 'participantId'>) => {
    addLogProp({ ...entry, sessionId: session.sessionId, participantId: session.participantId })
  }

  // Reinitialize controller when condition changes
  useEffect(() => {
    controllerRef.current = new InputController(condition.inputMethod, session.smileThreshold)
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

  // Rest timer
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

  const skipPhrase = () => {
    manager.nextPhrase()
    if (manager.isConditionComplete()) {
      if (conditionIndex + 1 >= manager.getConditionOrder().length) { onNext() }
      else { setPhase('condition-survey') }
    } else {
      addLog({ ts: Date.now(), type: 'phrase_show', description: `[跳过] 短语 ${manager.getPhraseIndex() + 1}/${ppc}: "${manager.getCurrentPhrase()}"`, layout: condition.layout, isTutorial: false })
      forceUpdate(n => n + 1)
    }
  }

  const skipCondition = () => {
    if (conditionIndex + 1 >= manager.getConditionOrder().length) { onNext() }
    else { setRestSecsLeft(REST_SECS); setPhase('resting') }
  }

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
      smileNaturalness:   answers.smileNaturalness ?? undefined,
      smileEmbarrassment: answers.smileEmbarrassment ?? undefined,
    })
    setRestSecsLeft(REST_SECS)
    setPhase('resting')
  }

  // ── Left sidebar (always visible) ────────────────────────────────────────
  const conditionOrder = manager.getConditionOrder()
  const sidebar = (
    <div style={sidebarStyle}>
      <div style={{ fontSize: 9, color: '#333', letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' }}>
        实验进度
      </div>
      {conditionOrder.map((cond, i) => {
        const isActive = i === conditionIndex && phase === 'running'
        const isDone = i < conditionIndex || (i === conditionIndex && phase !== 'running' && manager.isConditionComplete())
        return (
          <div key={i} style={{
            padding: '6px 8px', borderRadius: 6, marginBottom: 3,
            background: isActive ? '#0e1e3a' : 'transparent',
            border: `1px solid ${isActive ? '#2a5080' : 'transparent'}`,
            opacity: isDone ? 0.35 : 1,
            transition: 'all 200ms',
          }}>
            <div style={{ fontSize: 9, color: isActive ? '#8be9fd' : '#444', letterSpacing: 0.5 }}>
              条件 {i + 1}{isDone ? ' ✓' : ''}
            </div>
            <div style={{ fontSize: 10, fontWeight: isActive ? 600 : 400, color: isActive ? '#cdd6f4' : '#555' }}>
              {cond.layout.toUpperCase()}
            </div>
            <div style={{ fontSize: 10, color: isActive ? '#f1fa8c' : '#444' }}>
              {METHOD_ZH[cond.inputMethod]}
            </div>
            {isActive && (
              <div style={{ fontSize: 9, color: '#8b949e', marginTop: 3 }}>
                {manager.getPhraseIndex() + 1} / {ppc}
                <div style={{
                  marginTop: 2, height: 2, borderRadius: 1,
                  background: '#1a2840',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%', borderRadius: 1,
                    width: `${(manager.getPhraseIndex() / ppc) * 100}%`,
                    background: '#4a8ab0',
                    transition: 'width 300ms',
                  }} />
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )

  const ctrl = controllerRef.current
  const targetChar = manager.getTargetChar()
  const phrase = manager.getCurrentPhrase()
  const charIndex = manager.getCharIndex()

  const kbAvailW = window.innerWidth - SIDEBAR_W - 32
  const kbAvailH = (window.innerHeight - 160) * 0.78
  const keySize = condition.layout === 'qwerty'
    ? computeQwertyKeySize(kbAvailW, kbAvailH)
    : computeOptiKeySize(kbAvailW, kbAvailH)

  return (
    <>
      {/* video must stay mounted through rest screens so FaceDetector keeps its stream */}
      <video ref={videoRef} style={{ display: 'none' }} />
      <GazeCursor ref={cursorRef} />
      <FaceDebugPanel videoRef={videoRef} faceEvent={faceEvent} gaze={gaze} />
      {sidebar}

      {/* ── Rest screen ──────────────────────────────────────────────────── */}
      {phase === 'condition-survey' ? (
        <div style={{ paddingLeft: SIDEBAR_W }}>
          <ConditionSurvey
            conditionIndex={conditionIndex}
            layout={condition.layout}
            inputMethod={condition.inputMethod}
            onSubmit={handleSurveySubmit}
          />
        </div>
      ) : phase === 'resting' ? (
        <div style={{ ...centerStyle, paddingLeft: SIDEBAR_W }}>
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
      ) : (
        <>
          {/* Experimenter badge */}
          <div style={{
            position: 'fixed', top: 8, right: 12, zIndex: 200,
            display: 'flex', gap: 8, alignItems: 'center',
            fontSize: 11, color: '#555',
          }}>
            <span>实验者: {session.experimenterName}</span>
            <span style={{ color: '#333' }}>|</span>
            <span>P{session.participantId}</span>
            <span style={{ color: '#333' }}>|</span>
            <span>条件 {conditionIndex + 1}/{manager.getConditionOrder().length}</span>
          </div>

          {/* Main content, offset by sidebar */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: '100vh', paddingTop: 20, paddingLeft: SIDEBAR_W, gap: 12 }}>

            {/* Condition info + debug buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 12, color: '#555', letterSpacing: 1 }}>
                {t('experiment.condition', { index: String(conditionIndex + 1) })}
                {' — '}
                {condition.layout.toUpperCase()} / {METHOD_ZH[condition.inputMethod]}
                {' — '}
                短语 {manager.getPhraseIndex() + 1}/{ppc}
              </span>
              <button onClick={skipPhrase} style={debugSkipBtn}>跳过短语</button>
              <button onClick={skipCondition} style={debugSkipBtn}>跳过条件</button>
            </div>

            {/* Phrase display */}
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

            {/* Smile score indicator */}
            {condition.inputMethod === 'smile' && ctrl && (
              <div style={{ fontSize: 13, color: '#f1fa8c' }}>
                😊 {(ctrl.getSmileScore() * 100).toFixed(0)}%
                {ctrl.getLockedKey() && (
                  <span style={{ marginLeft: 12 }}>🔒 {ctrl.getLockedKey()}</span>
                )}
              </div>
            )}

            {/* Keyboard */}
            {ctrl && (
              condition.layout === 'qwerty'
                ? <QwertyKeyboard controller={ctrl} gaze={gaze} targetChar={targetChar} onKeyRect={handleKeyRect} keySize={keySize} />
                : <OptiKeyboard controller={ctrl} gaze={gaze} targetChar={targetChar} onKeyRect={handleKeyRect} keySize={keySize} />
            )}

          </div>
        </>
      )}
    </>
  )
}

const sidebarStyle: React.CSSProperties = {
  position: 'fixed', left: 0, top: 0, bottom: 0, width: SIDEBAR_W,
  background: '#080b12', borderRight: '1px solid #141820',
  display: 'flex', flexDirection: 'column',
  padding: '16px 8px 8px', zIndex: 100, overflowY: 'auto',
}

const centerStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center',
  justifyContent: 'center', minHeight: '100vh', gap: 20,
}

const actionBtn: React.CSSProperties = {
  padding: '12px 32px', borderRadius: 8, border: 'none',
  background: '#5a7aff', color: '#fff', fontSize: 16, cursor: 'pointer',
}

const debugSkipBtn: React.CSSProperties = {
  padding: '2px 8px', borderRadius: 4, border: '1px solid #333',
  background: 'transparent', color: '#666', fontSize: 11, cursor: 'pointer',
}
