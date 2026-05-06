import { useState } from 'react'
import { FaceDebugPanel } from './FaceDebugPanel'
import { loadJSON, saveJSON } from '../utils/storage'
import type { FaceEvent, GazePoint } from '../types'
import type { GazeStatus } from '../core/InputSource'

const STORAGE_KEY  = 'debug_drawer_open'
const OFFSET_STEP  = 0.01
const clampOffset  = (v: number) => Math.max(-0.3, Math.min(0.3, Math.round(v * 1000) / 1000))

interface Props {
  videoRef: React.RefObject<HTMLVideoElement>
  faceEvent: FaceEvent | null
  gaze: GazePoint | null
  gazeMode: 'tobii' | 'mouse'
  gazeStatus: GazeStatus
  offsetX: number
  offsetY: number
  smileThreshold: number
  blinkMinMs: number
  blinkMaxMs: number
  onGazeModeChange: (mode: 'tobii' | 'mouse') => void
  onOffsetXChange: (v: number) => void
  onOffsetYChange: (v: number) => void
  onSmileThresholdChange: (v: number) => void
  onBlinkMinChange: (v: number) => void
  onBlinkMaxChange: (v: number) => void
}

export function DebugDrawer({
  videoRef, faceEvent, gaze,
  gazeMode, gazeStatus, offsetX, offsetY,
  smileThreshold, blinkMinMs, blinkMaxMs,
  onGazeModeChange, onOffsetXChange, onOffsetYChange,
  onSmileThresholdChange, onBlinkMinChange, onBlinkMaxChange,
}: Props) {
  const [open, setOpen] = useState(() => loadJSON<boolean>(STORAGE_KEY, false))

  const smileScore = faceEvent?.smileScore ?? 0
  const leftOpen   = gaze?.leftOpen
  const rightOpen  = gaze?.rightOpen
  const eyesOpen   = leftOpen !== false && rightOpen !== false

  const gazeColor = gazeMode === 'mouse' ? '#bd93f9'
    : gazeStatus === 'ok' ? '#50fa7b' : gazeStatus === 'error' ? '#ff6b6b' : '#555'

  const fmtOffset = (v: number) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`
  const fmtPct    = (v: number) => `${(v * 100).toFixed(0)}%`

  const toggle = () => {
    setOpen(v => { saveJSON(STORAGE_KEY, !v); return !v })
  }

  return (
    <div style={containerStyle}>
      <div style={barStyle} onClick={toggle}>
        <span style={{ fontSize: 11, color: '#555', userSelect: 'none' }}>🎥 调试面板</span>
        <span style={{ fontSize: 11, color: '#888', marginLeft: 12 }}>
          😊 {(smileScore * 100).toFixed(0)}%
        </span>
        {leftOpen !== undefined && (
          <span style={{ fontSize: 11, marginLeft: 8, color: eyesOpen ? '#50fa7b' : '#ff6b6b' }}>
            👁 {eyesOpen ? 'open' : 'closed'}
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#444', userSelect: 'none' }}>
          {open ? '▼ 收起' : '▲ 展开'}
        </span>
      </div>

      {open && (
        <div style={{ borderTop: '1px solid #1e2430' }}>
          <FaceDebugPanel videoRef={videoRef} faceEvent={faceEvent} gaze={gaze} />

          {/* Gaze controls */}
          <div style={ctrlRow}>
            <span style={ctrlLabel}>追踪</span>
            <button onClick={() => onGazeModeChange('tobii')} style={modeBtn(gazeMode === 'tobii')}>Tobii</button>
            <button onClick={() => onGazeModeChange('mouse')} style={modeBtn(gazeMode === 'mouse')}>鼠标</button>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: gazeColor, flexShrink: 0 }} />

            <div style={divider} />

            <span style={ctrlLabel}>偏移 X</span>
            <button onClick={() => onOffsetXChange(clampOffset(offsetX - OFFSET_STEP))} style={nudgeBtn}>−</button>
            <span style={ctrlValue}>{fmtOffset(offsetX)}</span>
            <button onClick={() => onOffsetXChange(clampOffset(offsetX + OFFSET_STEP))} style={nudgeBtn}>+</button>

            <span style={ctrlLabel}>Y</span>
            <button onClick={() => onOffsetYChange(clampOffset(offsetY - OFFSET_STEP))} style={nudgeBtn}>−</button>
            <span style={ctrlValue}>{fmtOffset(offsetY)}</span>
            <button onClick={() => onOffsetYChange(clampOffset(offsetY + OFFSET_STEP))} style={nudgeBtn}>+</button>

            {(offsetX !== 0 || offsetY !== 0) && (
              <>
                <div style={divider} />
                <button
                  onClick={() => { onOffsetXChange(0); onOffsetYChange(0) }}
                  style={{ ...nudgeBtn, width: 'auto', padding: '0 8px', fontSize: 10 }}
                >
                  重置
                </button>
              </>
            )}
          </div>

          {/* Input method controls */}
          <div style={{ ...ctrlRow, borderTop: '1px solid #1e2430' }}>
            <span style={ctrlLabel}>😊 阈值</span>
            <button onClick={() => onSmileThresholdChange(Math.max(0.1, Math.round((smileThreshold - 0.05) * 100) / 100))} style={nudgeBtn}>−</button>
            <span style={{ ...ctrlValue, color: '#f1fa8c' }}>{fmtPct(smileThreshold)}</span>
            <button onClick={() => onSmileThresholdChange(Math.min(1.0, Math.round((smileThreshold + 0.05) * 100) / 100))} style={nudgeBtn}>+</button>

            <div style={divider} />

            <span style={ctrlLabel}>眨眼最短</span>
            <button onClick={() => onBlinkMinChange(Math.max(0, blinkMinMs - 10))} style={nudgeBtn}>−</button>
            <span style={{ ...ctrlValue, color: '#8be9fd' }}>{blinkMinMs}ms</span>
            <button onClick={() => onBlinkMinChange(Math.min(blinkMaxMs - 10, blinkMinMs + 10))} style={nudgeBtn}>+</button>

            <span style={ctrlLabel}>最长</span>
            <button onClick={() => onBlinkMaxChange(Math.max(blinkMinMs + 10, blinkMaxMs - 10))} style={nudgeBtn}>−</button>
            <span style={{ ...ctrlValue, color: '#8be9fd' }}>{blinkMaxMs}ms</span>
            <button onClick={() => onBlinkMaxChange(Math.min(600, blinkMaxMs + 10))} style={nudgeBtn}>+</button>
          </div>
        </div>
      )}
    </div>
  )
}

const containerStyle: React.CSSProperties = {
  flexShrink: 0,
  background: '#080b12',
  borderTop: '1px solid #1e2430',
}

const barStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center',
  padding: '0 16px', height: 36, cursor: 'pointer',
  gap: 4,
}

const ctrlRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
  padding: '6px 12px',
}

const ctrlLabel: React.CSSProperties = {
  fontSize: 10, color: '#555', whiteSpace: 'nowrap',
}

const ctrlValue: React.CSSProperties = {
  fontSize: 11, fontFamily: 'monospace',
  minWidth: 52, textAlign: 'center',
}

const divider: React.CSSProperties = {
  width: 1, height: 14, background: '#1e2430', flexShrink: 0,
}

const modeBtn = (active: boolean): React.CSSProperties => ({
  padding: '2px 8px', borderRadius: 3, border: `1px solid ${active ? '#5a7aff' : '#21262d'}`,
  background: active ? '#1e1e4e' : 'transparent',
  color: active ? '#cdd6f4' : '#444',
  cursor: 'pointer', fontSize: 10,
})

const nudgeBtn: React.CSSProperties = {
  width: 18, height: 18, borderRadius: 3, border: '1px solid #21262d',
  background: '#111827', color: '#bbb', cursor: 'pointer', fontSize: 12,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
}
