import { useState, useEffect, useRef, useCallback } from 'react'
import { useI18n } from '../i18n'
import type { SessionState } from '../App'
import type { GazePoint, ExperimentEvent, PhraseEvent, FaceEvent } from '../types'
import { GazeLayer } from '../core/GazeLayer'
import { FaceDetector } from '../core/FaceDetector'
import { InputController } from '../core/InputController'
import { ExperimentManager } from '../core/ExperimentManager'
import { DataStore } from '../core/DataStore'
import { GazeCursor } from '../components/GazeCursor'
import { FaceDebugPanel } from '../components/FaceDebugPanel'
import { QwertyKeyboard, computeQwertyKeySize } from '../components/keyboards/QwertyKeyboard'
import { OptiKeyboard, computeOptiKeySize } from '../components/keyboards/OptiKeyboard'

interface Props {
  session: SessionState
  onNext: () => void
}

const REST_SECS = 60
const REST_MIN_SECS = 30

export function ExperimentPage({ session, onNext }: Props) {
  const { t } = useI18n()
  const [gaze, setGaze] = useState<GazePoint | null>(null)
  const [faceEvent, setFaceEvent] = useState<FaceEvent | null>(null)
  const [resting, setResting] = useState(false)
  const [restSecsLeft, setRestSecsLeft] = useState(REST_SECS)
  const [conditionIndex, setConditionIndex] = useState(0)
  const [, forceUpdate] = useState(0)

  const keyRects = useRef<Map<string, DOMRect>>(new Map())
  const prevHitKey = useRef<string | null>(null)
  const gazeLayerRef = useRef(new GazeLayer('ws://localhost:7070'))
  const faceDetectorRef = useRef(new FaceDetector())
  const managerRef = useRef(new ExperimentManager(session.participantId))
  const storeRef = useRef(new DataStore())
  const videoRef = useRef<HTMLVideoElement>(null)
  const cursorRef = useRef<HTMLDivElement>(null)
  const controllerRef = useRef<InputController | null>(null)

  // Phrase-level timing
  const phraseStartRef    = useRef(Date.now())
  const lastInputTimeRef  = useRef(Date.now())
  const backspaceCountRef = useRef(0)
  const totalInputsRef    = useRef(0)
  const correctCountRef   = useRef(0)

  // Raw sampling (10 Hz) — refs keep gaze callback up-to-date without re-subscribing
  const SAMPLE_HZ = 10
  const lastSampleRef      = useRef(0)
  const latestFaceRef      = useRef<FaceEvent | null>(null)
  const conditionIndexRef  = useRef(conditionIndex)
  const restingRef         = useRef(resting)
  conditionIndexRef.current = conditionIndex
  restingRef.current        = resting

  const manager = managerRef.current
  const store = storeRef.current
  const condition = manager.getConditionOrder()[conditionIndex]

  const resetPhraseTimer = () => {
    const now = Date.now()
    phraseStartRef.current    = now
    lastInputTimeRef.current  = now
    backspaceCountRef.current = 0
    totalInputsRef.current    = 0
    correctCountRef.current   = 0
  }

  // Reinitialize controller when condition changes
  useEffect(() => {
    controllerRef.current = new InputController(condition.inputMethod, session.smileThreshold)
    const ctrl = controllerRef.current
    manager.startCondition(conditionIndex)
    prevHitKey.current = null
    resetPhraseTimer()

    const unsub = ctrl.onInput((fired) => {
      const now = fired.ts
      const phraseIndex = manager.getPhraseIndex()
      const isBackspace = fired.key === 'BACKSPACE'
      const inputChar = fired.key === 'SPACE' ? ' ' : fired.key.toLowerCase()
      const record = manager.recordInput(inputChar)

      // Per-keypress timing
      const charEntryTime = now - lastInputTimeRef.current
      lastInputTimeRef.current = now
      totalInputsRef.current++
      if (isBackspace) backspaceCountRef.current++
      else if (record.isCorrect) correctCountRef.current++

      const event: ExperimentEvent = {
        sessionId: session.sessionId,
        conditionIndex,
        layout: condition.layout,
        inputMethod: condition.inputMethod,
        phraseIndex,
        targetChar: record.targetChar,
        inputChar: record.inputChar,
        isCorrect: record.isCorrect,
        gazeX: fired.gazeX,
        gazeY: fired.gazeY,
        blinkLeft: fired.blinkLeft,
        blinkRight: fired.blinkRight,
        smileScore: fired.smileScore,
        actionTimestamp: now,
        charEntryTime,
        dwellDuration: fired.dwellDuration,
      }
      store.saveEvent(event)

      // Phrase complete — save phrase-level summary
      if (manager.isPhraseComplete()) {
        const phraseText   = manager.getCurrentPhrase()
        const durationMs   = now - phraseStartRef.current
        const nonBackspace = totalInputsRef.current - backspaceCountRef.current
        const phraseEvt: PhraseEvent = {
          sessionId:      session.sessionId,
          conditionIndex,
          layout:         condition.layout,
          inputMethod:    condition.inputMethod,
          phraseIndex,
          phraseText,
          phraseStartTime: phraseStartRef.current,
          phraseEndTime:   now,
          durationMs,
          wpm: durationMs > 0 ? (phraseText.length / 5) / (durationMs / 60000) : 0,
          totalInputs:     totalInputsRef.current,
          backspaceCount:  backspaceCountRef.current,
          correctChars:    correctCountRef.current,
          errorRate: nonBackspace > 0
            ? (nonBackspace - correctCountRef.current) / nonBackspace
            : 0,
        }
        store.savePhraseEvent(phraseEvt)
        manager.nextPhrase()
        resetPhraseTimer()
      }

      forceUpdate(n => n + 1)

      if (manager.isConditionComplete()) {
        if (conditionIndex + 1 >= 6) {
          store.updateSessionEnd(session.sessionId, Date.now())
          onNext()
        } else {
          setResting(true)
          setRestSecsLeft(REST_SECS)
        }
      }
    })

    return unsub
  }, [conditionIndex]) // eslint-disable-line react-hooks/exhaustive-deps

  // Setup gaze layer + save session on mount
  useEffect(() => {
    store.init().then(() => {
      store.saveSession({
        id: session.sessionId,
        participantId: session.participantId,
        language: session.language,
        conditionOrder: manager.getConditionOrder(),
        smileCalibPeak: session.smileCalibPeak,
        smileThreshold: session.smileThreshold,
        startTime: Date.now(),
        endTime: 0,
      })
    })

    const gLayer = gazeLayerRef.current
    gLayer.setOffset(session.gazeOffsetX ?? 0, session.gazeOffsetY ?? 0)
    gLayer.setCursorElement(cursorRef.current)
    gLayer.connect()

    const unsub = gLayer.onGaze((g) => {
      setGaze(g)
      if (controllerRef.current) {
        controllerRef.current.setGaze(g)
        if (g.eyeOpen !== undefined) controllerRef.current.feedEyeOpen(g.eyeOpen)
      }

      const px = gLayer.toPixel(g, window.innerWidth, window.innerHeight)
      let hit: string | null = null
      keyRects.current.forEach((rect, key) => {
        if (px.x >= rect.left && px.x <= rect.right &&
            px.y >= rect.top && px.y <= rect.bottom) {
          hit = key
        }
      })

      const ctrl = controllerRef.current
      if (ctrl && hit !== prevHitKey.current) {
        if (prevHitKey.current) ctrl.gazeLeaveKey(prevHitKey.current)
        if (hit) ctrl.gazeEnterKey(hit, g)
        prevHitKey.current = hit
      }

      // 10 Hz raw sampling — only during active (non-rest) experiment
      if (!restingRef.current) {
        const now = Date.now()
        if (now - lastSampleRef.current >= 1000 / SAMPLE_HZ) {
          lastSampleRef.current = now
          const face = latestFaceRef.current
          store.saveRawSample({
            sessionId:      session.sessionId,
            conditionIndex: conditionIndexRef.current,
            phraseIndex:    manager.getPhraseIndex(),
            charIndex:      manager.getCharIndex(),
            ts:             now,
            mouthSmile:     face?.mouthSmile  ?? 0,
            cheekSquint:    face?.cheekSquint ?? 0,
            smileScore:     face?.smileScore  ?? 0,
            gazeX:          g.x,
            gazeY:          g.y,
            eyeOpen:        g.eyeOpen ?? true,
          })
        }
      }
    })

    return () => { unsub(); gLayer.disconnect(); gLayer.setCursorElement(null) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Setup face detector
  useEffect(() => {
    const det = faceDetectorRef.current
    det.init().then(() => {
      navigator.mediaDevices.getUserMedia({ video: true }).then(stream => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play()
        }
        det.start(videoRef.current!)
      })
    })
    const unsub = det.onFace(face => {
      setFaceEvent(face)
      latestFaceRef.current = face
      if (controllerRef.current) controllerRef.current.feedFace(face)
    })
    return () => { unsub(); det.stop() }
  }, [])

  // Rest timer
  useEffect(() => {
    if (!resting) return
    const timer = setInterval(() => {
      setRestSecsLeft(s => {
        if (s <= 1) {
          clearInterval(timer)
          setResting(false)
          setConditionIndex(i => i + 1)
          return REST_SECS
        }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [resting])

  const handleKeyRect = useCallback((key: string, rect: DOMRect) => {
    keyRects.current.set(key, rect)
  }, [])

  // Rest screen
  if (resting) {
    return (
      <div style={centerStyle}>
        <h2 style={{ color: '#f1fa8c' }}>{t('experiment.rest')}</h2>
        <p style={{ color: '#aaa', fontSize: 18 }}>
          {t('experiment.restMessage', { seconds: String(restSecsLeft) })}
        </p>
        {restSecsLeft <= REST_MIN_SECS && (
          <button
            onClick={() => { setResting(false); setConditionIndex(i => i + 1) }}
            style={actionBtn}
          >
            {t('experiment.restSkip')}
          </button>
        )}
      </div>
    )
  }

  const ctrl = controllerRef.current
  const targetChar = manager.getTargetChar()
  const phrase = manager.getCurrentPhrase()
  const charIndex = manager.getCharIndex()

  // Reserve ~20% of screen height for condition info + phrase + smile indicator
  const kbAvailW = window.innerWidth - 32
  const kbAvailH = window.innerHeight * 0.78
  const keySize = condition.layout === 'qwerty'
    ? computeQwertyKeySize(kbAvailW, kbAvailH)
    : computeOptiKeySize(kbAvailW, kbAvailH)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: '100vh', paddingTop: 20, gap: 12 }}>
      <video ref={videoRef} style={{ display: 'none' }} />
      <GazeCursor ref={cursorRef} />
      <FaceDebugPanel videoRef={videoRef} faceEvent={faceEvent} gaze={gaze} />

      {/* Condition info */}
      <div style={{ fontSize: 12, color: '#555', letterSpacing: 1 }}>
        {t('experiment.condition', { index: String(conditionIndex + 1) })}
        {' — '}
        {condition.layout.toUpperCase()} / {condition.inputMethod}
      </div>

      {/* Phrase display */}
      <div style={{ fontSize: 20, letterSpacing: 3, fontFamily: 'monospace', padding: '10px 20px', background: '#111', borderRadius: 6 }}>
        {phrase.split('').map((ch, i) => (
          <span
            key={i}
            style={{
              color: i < charIndex ? '#50fa7b' : i === charIndex ? '#fff' : '#444',
              fontWeight: i === charIndex ? 'bold' : 'normal',
              textDecoration: i === charIndex ? 'underline' : 'none',
            }}
          >
            {ch === ' ' ? '\u00a0' : ch}
          </span>
        ))}
      </div>

      {/* Smile score indicator */}
      {condition.inputMethod === 'smile' && ctrl && (
        <div style={{ fontSize: 13, color: '#f1fa8c' }}>
          😊 {(ctrl.getSmileScore() * 100).toFixed(0)}%
          {ctrl.getLockedKey() && (
            <span style={{ marginLeft: 12, color: '#f1fa8c' }}>
              🔒 {ctrl.getLockedKey()}
            </span>
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
  )
}

const centerStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center',
  justifyContent: 'center', minHeight: '100vh', gap: 20,
}

const actionBtn: React.CSSProperties = {
  padding: '12px 32px', borderRadius: 8, border: 'none',
  background: '#5a7aff', color: '#fff', fontSize: 16, cursor: 'pointer',
}
