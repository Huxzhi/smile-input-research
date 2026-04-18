import { useState, useEffect, useRef, useCallback } from 'react'
import { FaceDetector } from '../core/FaceDetector'
import { GazeLayer } from '../core/GazeLayer'
import { InputController } from '../core/InputController'
import { GazeCursor } from '../components/GazeCursor'
import { FaceDebugPanel } from '../components/FaceDebugPanel'
import { QwertyKeyboard, computeQwertyKeySize } from '../components/keyboards/QwertyKeyboard'
import { OptiKeyboard, computeOptiKeySize } from '../components/keyboards/OptiKeyboard'
import { useI18n } from '../i18n'
import type { GazePoint, FaceEvent, Language } from '../types'

interface Props {
  onStart: (offsetX: number, offsetY: number) => void
}

const OFFSET_STEP = 0.01

export function DebugPage({ onStart }: Props) {
  const { t, lang, setLang } = useI18n()
  const [layout, setLayout] = useState<'qwerty' | 'opti'>('qwerty')
  const [offsetX, setOffsetX] = useState(0)
  const [offsetY, setOffsetY] = useState(0)
  const [gaze, setGaze] = useState<GazePoint | null>(null)
  const [faceEvent, setFaceEvent] = useState<FaceEvent | null>(null)
  const [tobiiStatus, setTobiiStatus] = useState<'connecting' | 'ok' | 'error'>('connecting')
  const [cameraOk, setCameraOk] = useState<boolean | null>(null)
  const [, forceUpdate] = useState(0)

  const gazeLayerRef = useRef(new GazeLayer('ws://localhost:7070'))
  const cursorRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const keyRects = useRef<Map<string, DOMRect>>(new Map())
  const prevHitKey = useRef<string | null>(null)
  const controllerRef = useRef(new InputController('dwell'))

  useEffect(() => {
    gazeLayerRef.current.setOffset(offsetX, offsetY)
  }, [offsetX, offsetY])

  useEffect(() => {
    keyRects.current.clear()
    prevHitKey.current = null
    controllerRef.current = new InputController('dwell')
  }, [layout])

  useEffect(() => {
    const gl = gazeLayerRef.current
    gl.setCursorElement(cursorRef.current)
    gl.connect()

    const unsub = gl.onGaze(g => {
      setGaze(g)
      setTobiiStatus('ok')

      const ctrl = controllerRef.current
      ctrl.setGaze(g)
      if (g.eyeOpen !== undefined) ctrl.feedEyeOpen(g.eyeOpen)

      const px = gl.toPixel(g, window.innerWidth, window.innerHeight)
      let hit: string | null = null
      keyRects.current.forEach((rect, key) => {
        if (px.x >= rect.left && px.x <= rect.right &&
            px.y >= rect.top && px.y <= rect.bottom) hit = key
      })
      if (hit !== prevHitKey.current) {
        if (prevHitKey.current) ctrl.gazeLeaveKey(prevHitKey.current)
        if (hit) ctrl.gazeEnterKey(hit, g)
        prevHitKey.current = hit
      }
      forceUpdate(n => n + 1)
    })

    const ws = new WebSocket('ws://localhost:7070')
    ws.onopen = () => ws.close()
    ws.onerror = () => setTobiiStatus(s => s === 'connecting' ? 'error' : s)

    return () => { unsub(); gl.disconnect(); gl.setCursorElement(null) }
  }, [])

  useEffect(() => {
    if (!navigator.mediaDevices) { setCameraOk(false); return }
    const detector = new FaceDetector()

    detector.init().then(() => {
      navigator.mediaDevices.getUserMedia({ video: true })
        .then(stream => {
          streamRef.current = stream
          setCameraOk(true)
          if (videoRef.current) {
            videoRef.current.srcObject = stream
            videoRef.current.play()
            detector.start(videoRef.current)
          }
        })
        .catch(() => setCameraOk(false))
    })

    const unsub = detector.onFace(setFaceEvent)
    return () => { unsub(); detector.stop(); streamRef.current?.getTracks().forEach(t => t.stop()) }
  }, [])

  const handleKeyRect = useCallback((key: string, rect: DOMRect) => {
    keyRects.current.set(key, rect)
  }, [])

  const tobiiColor = tobiiStatus === 'ok' ? '#50fa7b' : tobiiStatus === 'error' ? '#ff6b6b' : '#555'
  const cameraColor = cameraOk === true ? '#50fa7b' : cameraOk === false ? '#ff6b6b' : '#555'

  const tobiiDetail = gaze
    ? `x=${gaze.x.toFixed(3)}  y=${gaze.y.toFixed(3)}`
    : tobiiStatus === 'error' ? t('debug.tobiiNotConnected') : t('debug.connecting')

  const cameraDetail = faceEvent
    ? `${t('debug.smileLabel')} ${(faceEvent.smileScore * 100).toFixed(0)}%`
    : cameraOk === false ? t('debug.cameraUnavailable') : t('debug.initializing')

  const kbAvailW = window.innerWidth - 48
  const kbAvailH = window.innerHeight * 0.52
  const ctrl = controllerRef.current

  return (
    <div style={pageStyle}>
      <video ref={videoRef} style={{ display: 'none' }} />
      <GazeCursor ref={cursorRef} />
      <FaceDebugPanel videoRef={videoRef} faceEvent={faceEvent} gaze={gaze} />

      {/* Language switcher — top right */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        {(['zh', 'ja', 'en'] as Language[]).map(l => (
          <button key={l} onClick={() => setLang(l)} style={langBtn(lang === l)}>
            {l === 'zh' ? '中文' : l === 'ja' ? '日本語' : 'English'}
          </button>
        ))}
      </div>

      {/* Keyboard */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {layout === 'qwerty' ? (
          <QwertyKeyboard
            controller={ctrl} gaze={gaze} targetChar=""
            onKeyRect={handleKeyRect}
            keySize={computeQwertyKeySize(kbAvailW, kbAvailH)}
          />
        ) : (
          <OptiKeyboard
            controller={ctrl} gaze={gaze} targetChar=""
            onKeyRect={handleKeyRect}
            keySize={computeOptiKeySize(kbAvailW, kbAvailH)}
          />
        )}
      </div>

      {/* ── Debug info below keyboard ── */}

      {/* Layout toggle */}
      <div style={rowStyle}>
        <span style={labelStyle}>{t('debug.layout')}</span>
        {(['qwerty', 'opti'] as const).map(l => (
          <button key={l} onClick={() => setLayout(l)} style={tabBtn(layout === l)}>
            {l.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Status cards */}
      <div style={rowStyle}>
        <StatusPill label="Tobii" color={tobiiColor} detail={tobiiDetail} />
        <StatusPill label="Camera" color={cameraColor} detail={cameraDetail} />
      </div>

      {/* Gaze offset */}
      <div style={rowStyle}>
        <span style={labelStyle}>{t('debug.gazeOffset')}</span>
        <OffsetControl label="X" value={offsetX} onChange={setOffsetX} />
        <OffsetControl label="Y" value={offsetY} onChange={setOffsetY} />
        {(offsetX !== 0 || offsetY !== 0) && (
          <button onClick={() => { setOffsetX(0); setOffsetY(0) }} style={resetBtnStyle}>
            {t('debug.reset')}
          </button>
        )}
      </div>

      {/* Start button */}
      <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: 16 }}>
        <button onClick={() => onStart(offsetX, offsetY)} style={startBtnStyle}>
          {t('debug.start')}
        </button>
      </div>
    </div>
  )
}

function OffsetControl({ label, value, onChange }: {
  label: string; value: number; onChange: (v: number) => void
}) {
  const clamp = (v: number) => Math.max(-0.3, Math.min(0.3, Math.round(v * 1000) / 1000))
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ color: '#666', fontSize: 11, minWidth: 12 }}>{label}</span>
      <button onClick={() => onChange(clamp(value - OFFSET_STEP))} style={nudgeBtnStyle}>−</button>
      <span style={{ color: '#f1fa8c', fontSize: 12, fontFamily: 'monospace', minWidth: 54, textAlign: 'center' }}>
        {value >= 0 ? '+' : ''}{(value * 100).toFixed(1)}%
      </span>
      <button onClick={() => onChange(clamp(value + OFFSET_STEP))} style={nudgeBtnStyle}>+</button>
    </div>
  )
}

function StatusPill({ label, color, detail }: { label: string; color: string; detail: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '6px 14px', background: '#111827', borderRadius: 20,
      border: `1px solid ${color}`,
    }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{ color: '#aaa', fontSize: 12, fontWeight: 600 }}>{label}</span>
      <span style={{ color: '#555', fontSize: 11, fontFamily: 'monospace' }}>{detail}</span>
    </div>
  )
}

const pageStyle: React.CSSProperties = {
  minHeight: '100vh', display: 'flex', flexDirection: 'column',
  gap: 10, padding: '10px 20px',
}

const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
}

const labelStyle: React.CSSProperties = {
  color: '#444', fontSize: 12, minWidth: 72,
}

const langBtn = (active: boolean): React.CSSProperties => ({
  padding: '5px 12px', borderRadius: 5,
  border: `1px solid ${active ? '#5a7aff' : '#2a2a3e'}`,
  background: active ? '#1e1e4e' : 'transparent',
  color: active ? '#cdd6f4' : '#444',
  cursor: 'pointer', fontSize: 12, marginLeft: 4,
})

const tabBtn = (active: boolean): React.CSSProperties => ({
  padding: '5px 14px', borderRadius: 5,
  border: `1px solid ${active ? '#5a7aff' : '#2a2a3e'}`,
  background: active ? '#1e1e4e' : 'transparent',
  color: active ? '#cdd6f4' : '#444',
  cursor: 'pointer', fontSize: 12,
})

const nudgeBtnStyle: React.CSSProperties = {
  width: 22, height: 22, borderRadius: 4, border: '1px solid #2a2a3e',
  background: '#111827', color: '#bbb', cursor: 'pointer', fontSize: 14,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
}

const resetBtnStyle: React.CSSProperties = {
  padding: '4px 10px', borderRadius: 4, border: '1px solid #333',
  background: 'transparent', color: '#555', cursor: 'pointer', fontSize: 11,
}

const startBtnStyle: React.CSSProperties = {
  padding: '13px 52px', borderRadius: 10, border: 'none',
  background: '#5a7aff', color: '#fff', fontSize: 17,
  cursor: 'pointer', letterSpacing: 2,
}
