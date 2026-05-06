import { useRef, useEffect, useCallback } from 'react'
import type { GazePoint, FaceEvent } from '../types'
import type { InputController } from './InputController'

interface Config {
  gaze: GazePoint | null
  faceEvent: FaceEvent | null
  toPixel: (g: GazePoint) => { x: number; y: number }
  controllerRef: { readonly current: InputController | null }
}

export function useGazeHitTest({ gaze, faceEvent, toPixel, controllerRef }: Config) {
  const keyRects = useRef(new Map<string, DOMRect>())
  const prevHitKey = useRef<string | null>(null)

  useEffect(() => {
    const ctrl = controllerRef.current
    if (ctrl && faceEvent) ctrl.feedFace(faceEvent)
  }, [faceEvent, controllerRef])

  useEffect(() => {
    if (!gaze) return
    const ctrl = controllerRef.current
    if (ctrl) {
      ctrl.setGaze(gaze)
      if (gaze.eyeOpen !== undefined) ctrl.feedEyeOpen(gaze.eyeOpen)
    }
    const px = toPixel(gaze)
    let hit: string | null = null
    keyRects.current.forEach((rect, rectKey) => {
      if (
        px.x >= rect.left && px.x <= rect.right &&
        px.y >= rect.top  && px.y <= rect.bottom
      ) hit = rectKey.split(':')[0]
    })
    if (ctrl && hit !== prevHitKey.current) {
      if (prevHitKey.current) ctrl.gazeLeaveKey(prevHitKey.current)
      if (hit) ctrl.gazeEnterKey(hit, gaze)
      prevHitKey.current = hit
    }
  }, [gaze, toPixel, controllerRef])

  const handleKeyRect = useCallback((key: string, rect: DOMRect) => {
    keyRects.current.set(key, rect)
  }, [])

  const resetHitTracking = useCallback(() => {
    prevHitKey.current = null
  }, [])

  return { handleKeyRect, resetHitTracking }
}
