import { useEffect, useRef } from 'react'
import type { FaceEvent, GazePoint } from '../types'

const W = 240
const H = 180

// ── Mouth / smile landmarks ────────────────────────────────────────────────
const MOUTH_CORNERS = [61, 291]
const UPPER_LIP = [61, 185, 40, 37, 0, 267, 270, 409, 291]
const LOWER_LIP = [61, 146, 91, 84, 17, 314, 405, 375, 291]

// ── Outer eye corners (lateral canthi) — Duchenne smile marker ─────────────
// When genuinely smiling, these pull toward the cheeks and "crinkle"
const LEFT_OUTER_CORNER  = 130  // temporal canthus, left
const RIGHT_OUTER_CORNER = 359  // temporal canthus, right

// ── Lower eyelid arcs — rise with cheekSquint in genuine smile ─────────────
const LEFT_LOWER_LID  = [145, 153, 154, 155, 157]
const RIGHT_LOWER_LID = [374, 380, 381, 382, 384]

function drawPolyline(
  ctx: CanvasRenderingContext2D,
  landmarks: FaceEvent['landmarks'],
  indices: number[],
  close = false,
) {
  if (!landmarks) return
  ctx.beginPath()
  indices.forEach((idx, i) => {
    const lm = landmarks[idx]
    if (!lm) return
    if (i === 0) ctx.moveTo(lm.x * W, lm.y * H)
    else ctx.lineTo(lm.x * W, lm.y * H)
  })
  if (close) ctx.closePath()
  ctx.stroke()
}

function drawDots(
  ctx: CanvasRenderingContext2D,
  landmarks: FaceEvent['landmarks'],
  indices: number[],
  radius: number,
) {
  if (!landmarks) return
  for (const idx of indices) {
    const lm = landmarks[idx]
    if (!lm) continue
    ctx.beginPath()
    ctx.arc(lm.x * W, lm.y * H, radius, 0, Math.PI * 2)
    ctx.fill()
  }
}

interface Props {
  videoRef: React.RefObject<HTMLVideoElement>
  faceEvent: FaceEvent | null
  gaze?: GazePoint | null
}

export function FaceDebugPanel({ videoRef, faceEvent, gaze }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const faceRef = useRef<FaceEvent | null>(null)
  faceRef.current = faceEvent

  useEffect(() => {
    const canvas = canvasRef.current
    const video = videoRef.current
    if (!canvas || !video) return

    let animId: number
    const draw = () => {
      const ctx = canvas.getContext('2d')!
      ctx.clearRect(0, 0, W, H)

      if (video.readyState >= 2) {
        ctx.drawImage(video, 0, 0, W, H)
      }

      const face = faceRef.current
      if (face?.landmarks?.length) {
        const squint = face.cheekSquint  // 0–1

        // ── Lower eyelid arcs (cheek squint indicator) ──────────────────
        // Opacity and color intensity scale with cheekSquint score
        const lidAlpha = 0.4 + squint * 0.6
        ctx.strokeStyle = `rgba(255, 160, 60, ${lidAlpha})`
        ctx.lineWidth = 1.5
        drawPolyline(ctx, face.landmarks, LEFT_LOWER_LID)
        drawPolyline(ctx, face.landmarks, RIGHT_LOWER_LID)

        // ── Outer eye corner dots ────────────────────────────────────────
        const cornerRadius = 2 + squint * 4  // grows with genuine smile
        ctx.fillStyle = `rgba(255, 160, 60, ${lidAlpha})`
        drawDots(ctx, face.landmarks, [LEFT_OUTER_CORNER, RIGHT_OUTER_CORNER], cornerRadius)

        // ── Lip outline (upper + lower) ──────────────────────────────────
        ctx.strokeStyle = 'rgba(241, 250, 140, 0.85)'
        ctx.lineWidth = 1.5
        drawPolyline(ctx, face.landmarks, UPPER_LIP)
        drawPolyline(ctx, face.landmarks, LOWER_LIP)

        ctx.fillStyle = 'rgba(241, 250, 140, 0.85)'
        drawDots(ctx, face.landmarks, UPPER_LIP, 2)
        drawDots(ctx, face.landmarks, LOWER_LIP, 2)

        // ── Mouth corners (primary smile points) ─────────────────────────
        ctx.fillStyle = '#50fa7b'
        drawDots(ctx, face.landmarks, MOUTH_CORNERS, 4)
      }

      animId = requestAnimationFrame(draw)
    }
    animId = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(animId)
  }, [videoRef])

  const mouthSmile  = faceEvent?.mouthSmile  ?? 0
  const cheekSquint = faceEvent?.cheekSquint ?? 0
  const smileScore  = faceEvent?.smileScore  ?? 0

  // Eye open/closed only from Tobii
  const hasTobii = gaze?.leftOpen !== undefined

  return (
    <div style={panelStyle}>
      <canvas ref={canvasRef} width={W} height={H} style={{ borderRadius: 6, display: 'block' }} />

      {/* Mouth corners bar */}
      <ScoreBar
        icon="😊"
        label="口角"
        value={mouthSmile}
        color={mouthSmile > 0.4 ? '#50fa7b' : mouthSmile > 0.2 ? '#f1fa8c' : '#5a7aff'}
      />

      {/* Cheek squint bar (Duchenne / eye corner) */}
      <ScoreBar
        icon="✨"
        label="眼角"
        value={cheekSquint}
        color={cheekSquint > 0.3 ? '#ffa03c' : cheekSquint > 0.15 ? '#f1fa8c' : '#5a7aff'}
      />

      {/* Combined score */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 11, color: '#666', minWidth: 44 }}>综合</span>
        <span style={{ fontSize: 13, fontFamily: 'monospace', color: smileScore > 0.35 ? '#50fa7b' : '#888' }}>
          {(smileScore * 100).toFixed(0)}%
        </span>
      </div>

      {/* Tobii eye indicators (only when available) */}
      {hasTobii && (
        <>
          {eyeIndicator('L', gaze!.leftOpen ?? true)}
          {eyeIndicator('R', gaze!.rightOpen ?? true)}
        </>
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
        <div style={{
          width: `${value * 100}%`, height: '100%',
          background: color, borderRadius: 4,
          transition: 'width 40ms linear, background 200ms',
        }} />
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
      <div style={{
        flex: 1, height: 8, borderRadius: 3,
        background: open ? '#50fa7b' : '#ff6b6b',
        transition: 'background 60ms ease',
      }} />
      <span style={{ fontSize: 11, fontFamily: 'monospace', minWidth: 40, textAlign: 'right',
        color: open ? '#50fa7b' : '#ff6b6b' }}>
        {open ? 'open' : 'closed'}
      </span>
    </div>
  )
}

const panelStyle: React.CSSProperties = {
  position: 'fixed', bottom: 12, right: 12,
  background: 'rgba(10, 10, 20, 0.92)',
  border: '1px solid #222',
  borderRadius: 10,
  padding: 8,
  zIndex: 9990,
  display: 'flex',
  flexDirection: 'column',
  gap: 7,
  boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
  minWidth: W,
}
