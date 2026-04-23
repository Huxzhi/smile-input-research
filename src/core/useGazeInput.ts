import { useState, useEffect, useRef, useCallback } from 'react'
import type { GazePoint, FaceEvent } from '../types'
import { InputSource, type GazeStatus } from './InputSource'
import { InputController } from './InputController'

interface Config {
  gazeMode: 'tobii' | 'mouse'
  offsetX?: number
  offsetY?: number
  videoRef: { readonly current: HTMLVideoElement | null }
  cursorRef?: { readonly current: HTMLElement | null }
  controllerRef: { readonly current: InputController | null }
}

export function useGazeInput({
  gazeMode,
  offsetX = 0,
  offsetY = 0,
  videoRef,
  cursorRef,
  controllerRef,
}: Config) {
  const [gaze, setGaze] = useState<GazePoint | null>(null)
  const [faceEvent, setFaceEvent] = useState<FaceEvent | null>(null)
  const [gazeStatus, setGazeStatus] = useState<GazeStatus>(
    gazeMode === 'mouse' ? 'ok' : 'connecting'
  )
  const keyRects = useRef(new Map<string, DOMRect>())
  const prevHitKey = useRef<string | null>(null)
  const srcRef = useRef<InputSource | null>(null)

  useEffect(() => {
    setGaze(null)
    setFaceEvent(null)
    setGazeStatus(gazeMode === 'mouse' ? 'ok' : 'connecting')
    prevHitKey.current = null

    const src = new InputSource(gazeMode)
    srcRef.current = src
    src.setOffset(offsetX, offsetY)
    if (cursorRef?.current) src.setCursorElement(cursorRef.current)
    src.onGazeStatus(setGazeStatus)

    const unsubFace = src.onFace(face => {
      setFaceEvent(face)
      controllerRef.current?.feedFace(face)
    })

    const unsubGaze = src.onGaze(g => {
      setGaze(g)
      if (gazeMode === 'tobii') setGazeStatus('ok')
      const ctrl = controllerRef.current
      if (ctrl) {
        ctrl.setGaze(g)
        if (g.eyeOpen !== undefined) ctrl.feedEyeOpen(g.eyeOpen)
      }
      const px = src.toPixel(g, window.innerWidth, window.innerHeight)
      let hit: string | null = null
      keyRects.current.forEach((rect, rectKey) => {
        if (px.x >= rect.left && px.x <= rect.right &&
            px.y >= rect.top && px.y <= rect.bottom)
          hit = rectKey.split(':')[0]
      })
      if (ctrl && hit !== prevHitKey.current) {
        if (prevHitKey.current) ctrl.gazeLeaveKey(prevHitKey.current)
        if (hit) ctrl.gazeEnterKey(hit, g)
        prevHitKey.current = hit
      }
    })

    src.connect(videoRef.current)

    return () => {
      unsubGaze()
      unsubFace()
      src.disconnect()
      src.setCursorElement(null)
      srcRef.current = null
    }
  }, [gazeMode]) // eslint-disable-line react-hooks/exhaustive-deps

  // Update offset without recreating InputSource
  useEffect(() => {
    srcRef.current?.setOffset(offsetX, offsetY)
  }, [offsetX, offsetY])

  const handleKeyRect = useCallback((key: string, rect: DOMRect) => {
    keyRects.current.set(key, rect)
  }, [])

  // Call when swapping controllers so the first gaze event re-triggers enter
  const resetHitTracking = useCallback(() => {
    prevHitKey.current = null
  }, [])

  return { gaze, faceEvent, gazeStatus, handleKeyRect, resetHitTracking }
}
