import { useState, useEffect, useRef, useCallback } from 'react'
import type { GazePoint, FaceEvent } from '../types'
import { InputSource, type GazeStatus } from './InputSource'

interface Config {
  gazeMode: 'tobii' | 'mouse'
  offsetX?: number
  offsetY?: number
  videoRef: { readonly current: HTMLVideoElement | null }
  cursorRef?: { readonly current: HTMLElement | null }
}

export function useInputSource({
  gazeMode,
  offsetX = 0,
  offsetY = 0,
  videoRef,
  cursorRef,
}: Config) {
  const [gaze, setGaze] = useState<GazePoint | null>(null)
  const [faceEvent, setFaceEvent] = useState<FaceEvent | null>(null)
  const [gazeStatus, setGazeStatus] = useState<GazeStatus>(
    gazeMode === 'mouse' ? 'ok' : 'connecting'
  )
  const srcRef = useRef<InputSource | null>(null)

  useEffect(() => {
    setGaze(null)
    setFaceEvent(null)
    setGazeStatus(gazeMode === 'mouse' ? 'ok' : 'connecting')

    const src = new InputSource(gazeMode)
    srcRef.current = src
    src.setOffset(offsetX, offsetY)
    if (cursorRef?.current) src.setCursorElement(cursorRef.current)
    src.onGazeStatus(setGazeStatus)

    const unsubFace = src.onFace(setFaceEvent)
    const unsubGaze = src.onGaze(g => {
      setGaze(g)
      if (gazeMode === 'tobii') setGazeStatus('ok')
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

  useEffect(() => {
    srcRef.current?.setOffset(offsetX, offsetY)
  }, [offsetX, offsetY])

  const toPixel = useCallback((g: GazePoint): { x: number; y: number } => {
    if (!srcRef.current) return { x: 0, y: 0 }
    return srcRef.current.toPixel(g, window.innerWidth, window.innerHeight)
  }, [])

  return { gaze, faceEvent, gazeStatus, toPixel }
}
