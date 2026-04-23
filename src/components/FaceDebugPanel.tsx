import { useEffect, useRef, useState } from 'react'
import type { FaceEvent, GazePoint } from '../types'

// ── Mouth / smile landmarks ────────────────────────────────────────────────
const MOUTH_CORNERS = [61, 291]
const UPPER_LIP = [61, 185, 40, 37, 0, 267, 270, 409, 291]
const LOWER_LIP = [61, 146, 91, 84, 17, 314, 405, 375, 291]

const LEFT_OUTER_CORNER  = 130
const RIGHT_OUTER_CORNER = 359

const LEFT_LOWER_LID  = [145, 153, 154, 155, 157]
const RIGHT_LOWER_LID = [374, 380, 381, 382, 384]

function drawPolyline(
  ctx: CanvasRenderingContext2D,
  landmarks: FaceEvent['landmarks'],
  indices: number[],
  cW: number, cH: number,
  close = false,
) {
  if (!landmarks) return
  ctx.beginPath()
  indices.forEach((idx, i) => {
    const lm = landmarks[idx]
    if (!lm) return
    if (i === 0) ctx.moveTo(lm.x * cW, lm.y * cH)
    else ctx.lineTo(lm.x * cW, lm.y * cH)
  })
  if (close) ctx.closePath()
  ctx.stroke()
}

function drawDots(
  ctx: CanvasRenderingContext2D,
  landmarks: FaceEvent['landmarks'],
  indices: number[],
  cW: number, cH: number,
  radius: number,
) {
  if (!landmarks) return
  for (const idx of indices) {
    const lm = landmarks[idx]
    if (!lm) continue
    ctx.beginPath()
    ctx.arc(lm.x * cW, lm.y * cH, radius, 0, Math.PI * 2)
    ctx.fill()
  }
}

interface Props {
  videoRef: React.RefObject<HTMLVideoElement> | null
  faceEvent: FaceEvent | null
  gaze?: GazePoint | null
  embedded?: boolean
}

export function FaceDebugPanel({ videoRef, faceEvent, gaze, embedded = false }: Props) {
  const cW = embedded ? 192 : 240
  const cH = embedded ? 144 : 180

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const faceRef   = useRef<FaceEvent | null>(null)
  faceRef.current = faceEvent

  // Floating-mode state
  const [collapsed, setCollapsed] = useState(false)
  const [pos, setPos] = useState(() => ({
    x: window.innerWidth  - 256,
    y: window.innerHeight - 360,
  }))
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, baseX: 0, baseY: 0 })

  const onHeaderMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    dragRef.current = { dragging: true, startX: e.clientX, startY: e.clientY, baseX: pos.x, baseY: pos.y }
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current.dragging) return
      setPos({
        x: dragRef.current.baseX + ev.clientX - dragRef.current.startX,
        y: dragRef.current.baseY + ev.clientY - dragRef.current.startY,
      })
    }
    const onUp = () => {
      dragRef.current.dragging = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  useEffect(() => {
    const canvas = canvasRef.current
    const video = videoRef?.current ?? null
    if (!canvas || !video) return

    let animId: number
    const draw = () => {
      const ctx = canvas.getContext('2d')!
      ctx.clearRect(0, 0, cW, cH)

      if (video.readyState >= 2) ctx.drawImage(video, 0, 0, cW, cH)

      const face = faceRef.current
      if (face?.landmarks?.length) {
        const squint = face.cheekSquint
        const lidAlpha = 0.4 + squint * 0.6
        ctx.strokeStyle = `rgba(255, 160, 60, ${lidAlpha})`
        ctx.lineWidth = 1.5
        drawPolyline(ctx, face.landmarks, LEFT_LOWER_LID, cW, cH)
        drawPolyline(ctx, face.landmarks, RIGHT_LOWER_LID, cW, cH)

        const cornerRadius = 2 + squint * 4
        ctx.fillStyle = `rgba(255, 160, 60, ${lidAlpha})`
        drawDots(ctx, face.landmarks, [LEFT_OUTER_CORNER, RIGHT_OUTER_CORNER], cW, cH, cornerRadius)

        ctx.strokeStyle = 'rgba(241, 250, 140, 0.85)'
        ctx.lineWidth = 1.5
        drawPolyline(ctx, face.landmarks, UPPER_LIP, cW, cH)
        drawPolyline(ctx, face.landmarks, LOWER_LIP, cW, cH)

        ctx.fillStyle = 'rgba(241, 250, 140, 0.85)'
        drawDots(ctx, face.landmarks, UPPER_LIP, cW, cH, 2)
        drawDots(ctx, face.landmarks, LOWER_LIP, cW, cH, 2)

        ctx.fillStyle = '#50fa7b'
        drawDots(ctx, face.landmarks, MOUTH_CORNERS, cW, cH, 4)
      }

      animId = requestAnimationFrame(draw)
    }
    animId = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(animId)
  }, [videoRef, cW, cH]) // eslint-disable-line react-hooks/exhaustive-deps

  const mouthSmile  = faceEvent?.mouthSmile  ?? 0
  const cheekSquint = faceEvent?.cheekSquint ?? 0
  const smileScore  = faceEvent?.smileScore  ?? 0
  const blinkLeft   = faceEvent?.blinkLeft   ?? 0
  const blinkRight  = faceEvent?.blinkRight  ?? 0
  const hasTobii    = gaze?.leftOpen !== undefined

  const metrics = (
    <>
      <ScoreBar icon="😊" label="口角" value={mouthSmile}
        color={mouthSmile > 0.4 ? '#50fa7b' : mouthSmile > 0.2 ? '#f1fa8c' : '#5a7aff'} />
      <ScoreBar icon="✨" label="眼角" value={cheekSquint}
        color={cheekSquint > 0.3 ? '#ffa03c' : cheekSquint > 0.15 ? '#f1fa8c' : '#5a7aff'} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 11, color: '#666', minWidth: 44 }}>综合</span>
        <span style={{ fontSize: 13, fontFamily: 'monospace', color: smileScore > 0.35 ? '#50fa7b' : '#888' }}>
          {(smileScore * 100).toFixed(0)}%
        </span>
      </div>
      <ScoreBar icon="👁" label="眨左" value={blinkLeft}
        color={blinkLeft > 0.5 ? '#ff6b6b' : blinkLeft > 0.25 ? '#f1fa8c' : '#555'} />
      <ScoreBar icon="👁" label="眨右" value={blinkRight}
        color={blinkRight > 0.5 ? '#ff6b6b' : blinkRight > 0.25 ? '#f1fa8c' : '#555'} />
      {hasTobii && (
        <>
          {eyeIndicator('L', gaze!.leftOpen ?? true)}
          {eyeIndicator('R', gaze!.rightOpen ?? true)}
        </>
      )}
    </>
  )

  if (embedded) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8, height: '100%', overflow: 'hidden' }}>
        <canvas ref={canvasRef} width={cW} height={cH} style={{ borderRadius: 6, display: 'block', flexShrink: 0 }} />
        {metrics}
      </div>
    )
  }

  // Floating mode
  return (
    <div style={{ ...floatingBase, left: pos.x, top: pos.y }}>
      {/* Drag handle + collapse toggle */}
      <div
        onMouseDown={onHeaderMouseDown}
        style={headerStyle}
      >
        <span style={{ fontSize: 10, color: '#666', letterSpacing: 1, userSelect: 'none' }}>脸部参数</span>
        <button
          onMouseDown={e => e.stopPropagation()}
          onClick={() => setCollapsed(v => !v)}
          style={collapseBtn}
        >
          {collapsed ? '▲' : '▼'}
        </button>
      </div>

      {!collapsed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, paddingTop: 6 }}>
          <canvas ref={canvasRef} width={cW} height={cH} style={{ borderRadius: 6, display: 'block' }} />
          {metrics}
        </div>
      )}
    </div>
  )
}

function ScoreBar({ icon, label, value, color }: {
  icon: string; label: string; value: number; color: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 13 }}>{icon}</span>
      <span style={{ fontSize: 10, color: '#666', minWidth: 28 }}>{label}</span>
      <div style={{ flex: 1, height: 7, background: '#1a1a2e', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${value * 100}%`, height: '100%', background: color, borderRadius: 4, transition: 'background 200ms' }} />
      </div>
      <span style={{ fontSize: 11, fontFamily: 'monospace', minWidth: 32, textAlign: 'right', color }}>
        {(value * 100).toFixed(0)}%
      </span>
    </div>
  )
}

function eyeIndicator(label: string, open: boolean) {
  return (
    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 12, color: '#888', minWidth: 20, fontFamily: 'monospace' }}>👁{label}</span>
      <div style={{ flex: 1, height: 8, borderRadius: 3, background: open ? '#50fa7b' : '#ff6b6b', transition: 'background 60ms ease' }} />
      <span style={{ fontSize: 11, fontFamily: 'monospace', minWidth: 40, textAlign: 'right', color: open ? '#50fa7b' : '#ff6b6b' }}>
        {open ? 'open' : 'closed'}
      </span>
    </div>
  )
}

const floatingBase: React.CSSProperties = {
  position: 'fixed',
  background: 'rgba(10, 10, 20, 0.92)',
  border: '1px solid #222',
  borderRadius: 10,
  padding: 8,
  zIndex: 9990,
  boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
  minWidth: 240,
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  cursor: 'move',
  padding: '0 2px',
}

const collapseBtn: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#555',
  fontSize: 11,
  cursor: 'pointer',
  padding: '0 2px',
  lineHeight: 1,
}
