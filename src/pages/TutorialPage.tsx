import { useState, useEffect, useRef } from 'react'
import { useI18n } from '../i18n'
import { InputController } from '../core/InputController'
import { useGazeInput } from '../core/useGazeInput'
import { GazeCursor } from '../components/GazeCursor'
import { FaceDebugPanel } from '../components/FaceDebugPanel'
import { QwertyKeyboard, computeQwertyKeySize } from '../components/keyboards/QwertyKeyboard'
import type { InputMethod, FaceEvent } from '../types'

interface Props {
  participantId: string
  gazeOffsetX?: number
  gazeOffsetY?: number
  gazeMode?: 'tobii' | 'mouse'
  onNext: (smileCalibPeak: number, smileThreshold: number) => void
}

type Step = 'smile-calib' | 'dwell-practice' | 'blink-practice' | 'smile-practice'

const PRACTICE_CHARS = ['e', 't', 'a']
const INSTRUCTION_KEY: Record<Step, string> = {
  'smile-calib': 'smileCalibInstruction',
  'dwell-practice': 'dwellInstruction',
  'blink-practice': 'blinkInstruction',
  'smile-practice': 'smileInstruction',
}
const STEP_METHOD: Partial<Record<Step, InputMethod>> = {
  'dwell-practice': 'dwell',
  'blink-practice': 'blink',
  'smile-practice': 'smile',
}

const btnStyle = (bg: string, enabled = true): React.CSSProperties => ({
  padding: '12px 32px', borderRadius: 8, border: 'none',
  background: enabled ? bg : '#333',
  color: enabled ? (bg === '#50fa7b' ? '#000' : '#fff') : '#666',
  fontSize: 16, cursor: enabled ? 'pointer' : 'not-allowed',
})

export function TutorialPage({ gazeOffsetX = 0, gazeOffsetY = 0, gazeMode = 'tobii', onNext }: Props) {
  const { t } = useI18n()
  const [step, setStep] = useState<Step>('smile-calib')
  const [calibrating, setCalibrating] = useState(false)
  const [peakSmile, setPeakSmile] = useState(0)
  const [threshold, setThreshold] = useState(0)
  const [practiceIdx, setPracticeIdx] = useState(0)
  const [, forceUpdate] = useState(0)

  const faceRef = useRef<FaceEvent | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const controllerRef = useRef<InputController | null>(null)
  const cursorRef = useRef<HTMLDivElement>(null)
  const thresholdRef = useRef(0)
  const practiceIdxRef = useRef(0)
  const stepRef = useRef<Step>('smile-calib')
  const peakSmileRef = useRef(0)

  thresholdRef.current = threshold
  practiceIdxRef.current = practiceIdx
  stepRef.current = step
  peakSmileRef.current = peakSmile

  const { gaze, faceEvent, handleKeyRect, resetHitTracking } = useGazeInput({
    gazeMode: gazeMode ?? 'tobii',
    offsetX: gazeOffsetX,
    offsetY: gazeOffsetY,
    videoRef,
    cursorRef,
    controllerRef,
  })
  faceRef.current = faceEvent
  const smileScore = faceEvent?.smileScore ?? 0

  // Reinitialize InputController when practice step changes
  useEffect(() => {
    const method = STEP_METHOD[step]
    if (!method) { controllerRef.current = null; return }
    resetHitTracking()
    const ctrl = new InputController(method, thresholdRef.current)
    controllerRef.current = ctrl

    const unsub = ctrl.onInput(() => {
      const idx = practiceIdxRef.current
      const currentStep = stepRef.current
      if (idx < PRACTICE_CHARS.length - 1) {
        setPracticeIdx(i => i + 1)
      } else {
        setPracticeIdx(0)
        if (currentStep === 'dwell-practice') setStep('blink-practice')
        else if (currentStep === 'blink-practice') setStep('smile-practice')
        else if (currentStep === 'smile-practice') onNext(peakSmileRef.current, thresholdRef.current)
      }
      forceUpdate(n => n + 1)
    })

    return unsub
  }, [step]) // eslint-disable-line react-hooks/exhaustive-deps

  const runCalibration = () => {
    setCalibrating(true)
    let peak = 0
    const interval = setInterval(() => {
      const s = faceRef.current?.smileScore ?? 0
      if (s > peak) peak = s
    }, 50)
    setTimeout(() => {
      clearInterval(interval)
      const th = peak * 0.8
      setPeakSmile(peak)
      setThreshold(th)
      setCalibrating(false)
    }, 3000)
  }

  const advancePractice = () => {
    if (practiceIdx < PRACTICE_CHARS.length - 1) { setPracticeIdx(i => i + 1); return }
    setPracticeIdx(0)
    if (step === 'dwell-practice') setStep('blink-practice')
    else if (step === 'blink-practice') setStep('smile-practice')
    else if (step === 'smile-practice') onNext(peakSmile, threshold)
  }

  if (step === 'smile-calib') {
    return (
      <div style={centerStyle}>
        <video ref={videoRef} style={{ display: 'none' }} />
        <GazeCursor ref={cursorRef} />
        <FaceDebugPanel videoRef={videoRef} faceEvent={faceEvent} gaze={gaze} />
        <h2>{t('tutorial.smileCalib')}</h2>
        <p style={{ color: '#888' }}>{t('tutorial.smileCalibInstruction')}</p>
        <div style={{ fontSize: 32, color: '#f1fa8c', fontVariantNumeric: 'tabular-nums' }}>
          {(smileScore * 100).toFixed(0)}%
        </div>
        {!calibrating && threshold === 0 && (
          <button onClick={runCalibration} style={btnStyle('#5a7aff')}>
            {t('tutorial.smileCalibStart')}
          </button>
        )}
        {calibrating && (
          <p style={{ color: '#888' }}>
            {'⬤ ⬤ ⬤'.split(' ').map((d, i) => (
              <span key={i} style={{ opacity: 0.4 + i * 0.3, marginRight: 4 }}>{d}</span>
            ))}
          </p>
        )}
        {threshold > 0 && !calibrating && (
          <>
            <p style={{ color: '#50fa7b' }}>
              {t('tutorial.smileCalibDone', { threshold: (threshold * 100).toFixed(0) + '%' })}
            </p>
            <button onClick={() => setStep('dwell-practice')} style={btnStyle('#50fa7b')}>
              {t('tutorial.beginExperiment')}
            </button>
          </>
        )}
      </div>
    )
  }

  const ctrl = controllerRef.current
  const targetChar = PRACTICE_CHARS[practiceIdx]
  const kbAvailW = Math.min(window.innerWidth - 32, window.innerWidth * 0.80)
  const kbAvailH = window.innerHeight * 0.65
  const keySize = computeQwertyKeySize(kbAvailW, kbAvailH)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: '100vh', paddingTop: 20, gap: 16 }}>
      <video ref={videoRef} style={{ display: 'none' }} />
      <GazeCursor ref={cursorRef} />
      <FaceDebugPanel videoRef={videoRef} faceEvent={faceEvent} />

      <h2 style={{ margin: 0 }}>{t('tutorial.title')}</h2>
      <p style={{ color: '#888', textAlign: 'center', maxWidth: 480, margin: 0 }}>
        {t(`tutorial.${INSTRUCTION_KEY[step]}`)}
      </p>

      <div style={{
        padding: '16px 40px', background: '#1a1a2e', borderRadius: 8,
        fontSize: 24, letterSpacing: 4, color: '#50fa7b', border: '2px solid #5a7aff',
      }}>
        {t('tutorial.practiceTarget', { char: targetChar.toUpperCase() })}
      </div>

      <p style={{ color: '#555', fontSize: 13, margin: 0 }}>
        {practiceIdx + 1} / {PRACTICE_CHARS.length}
      </p>

      {step === 'smile-practice' && ctrl && (
        <div style={{ fontSize: 13, color: '#f1fa8c' }}>
          😊 {(ctrl.getSmileScore() * 100).toFixed(0)}%
          {ctrl.getLockedKey() && (
            <span style={{ marginLeft: 12, color: '#f1fa8c' }}>🔒 {ctrl.getLockedKey()}</span>
          )}
        </div>
      )}

      {ctrl && (
        <QwertyKeyboard
          controller={ctrl} gaze={gaze} targetChar={targetChar}
          onKeyRect={handleKeyRect} keySize={keySize} showTarget
        />
      )}

      <button onClick={advancePractice} style={btnStyle('#444')}>
        {practiceIdx < PRACTICE_CHARS.length - 1 ? t('tutorial.practice') : t('tutorial.practiceComplete')}
      </button>
    </div>
  )
}

const centerStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center',
  justifyContent: 'center', minHeight: '100vh', gap: 20,
}
