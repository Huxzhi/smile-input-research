import { useState } from 'react'
import { FaceDebugPanel } from './FaceDebugPanel'
import { loadJSON, saveJSON } from '../utils/storage'
import type { FaceEvent, GazePoint } from '../types'

const STORAGE_KEY = 'debug_drawer_open'

interface Props {
  videoRef: React.RefObject<HTMLVideoElement>
  faceEvent: FaceEvent | null
  gaze: GazePoint | null
}

export function DebugDrawer({ videoRef, faceEvent, gaze }: Props) {
  const [open, setOpen] = useState(() => loadJSON<boolean>(STORAGE_KEY, false))

  const smileScore = faceEvent?.smileScore ?? 0
  const leftOpen   = gaze?.leftOpen
  const rightOpen  = gaze?.rightOpen
  const eyesOpen   = leftOpen !== false && rightOpen !== false

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
          <span style={{
            fontSize: 11, marginLeft: 8,
            color: eyesOpen ? '#50fa7b' : '#ff6b6b',
          }}>
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
