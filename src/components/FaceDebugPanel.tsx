import { useEffect, useRef } from 'react'
import type { FaceEvent, GazePoint } from '../types'

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

  return (
    <div style={{ display: 'flex', flexDirection: 'row', gap: 12, padding: 8, alignItems: 'flex-start' }}>
      <canvas ref={canvasRef} width={cW} height={cH} style={{ borderRadius: 6, display: 'block', flexShrink: 0 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
        {metrics}
      </div>
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
