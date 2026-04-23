import { GazeLayer } from './GazeLayer'
import { FaceDetector } from './FaceDetector'
import type { GazePoint, FaceEvent } from '../types'

type GazeCb = (g: GazePoint) => void
type FaceCb = (f: FaceEvent) => void
type Unsub = () => void

export type GazeStatus = 'connecting' | 'ok' | 'error'

/**
 * Unified input source for both tobii and mouse modes.
 *
 * Tobii mode  — gaze via WebSocket, face (smile/blink) via MediaPipe webcam
 * Mouse mode  — gaze via mousemove, blink via mouse buttons (L/R click),
 *               smile via MediaPipe webcam (same camera as tobii mode)
 */
export class InputSource {
  readonly mode: 'tobii' | 'mouse'

  private gl: GazeLayer
  private fd: FaceDetector

  private faceCbs: FaceCb[] = []
  private gazeStatusCbs: Array<(s: GazeStatus) => void> = []
  private cameraStatusCbs: Array<(ok: boolean | null) => void> = []

  private cleanups: Unsub[] = []
  private stream: MediaStream | null = null

  constructor(mode: 'tobii' | 'mouse', wsUrl = 'ws://localhost:7070') {
    this.mode = mode
    this.gl = new GazeLayer(wsUrl)
    this.fd = new FaceDetector()
  }

  // ── Passthrough to GazeLayer ──────────────────────────────────────────────

  setOffset(dx: number, dy: number) { this.gl.setOffset(dx, dy) }
  setCursorElement(el: HTMLElement | null) { this.gl.setCursorElement(el) }
  toPixel(g: GazePoint, w: number, h: number) { return this.gl.toPixel(g, w, h) }
  onGaze(cb: GazeCb): Unsub { return this.gl.onGaze(cb) }

  // ── Face events ───────────────────────────────────────────────────────────

  onFace(cb: FaceCb): Unsub {
    this.faceCbs.push(cb)
    return () => { this.faceCbs = this.faceCbs.filter(c => c !== cb) }
  }

  // ── Status events ─────────────────────────────────────────────────────────

  onGazeStatus(cb: (s: GazeStatus) => void): Unsub {
    this.gazeStatusCbs.push(cb)
    return () => { this.gazeStatusCbs = this.gazeStatusCbs.filter(c => c !== cb) }
  }

  onCameraStatus(cb: (ok: boolean | null) => void): Unsub {
    this.cameraStatusCbs.push(cb)
    return () => { this.cameraStatusCbs = this.cameraStatusCbs.filter(c => c !== cb) }
  }

  // ── Connect ───────────────────────────────────────────────────────────────

  connect(videoEl?: HTMLVideoElement | null) {
    // Gaze source
    if (this.mode === 'tobii') {
      this.cleanups.push(
        this.gl.onError(() => this.gazeStatusCbs.forEach(cb => cb('error')))
      )
      this.gl.connect()
    } else {
      this.gl.connectMouse()
      this.gazeStatusCbs.forEach(cb => cb('ok'))
    }

    // Face source — camera in both modes
    this.cleanups.push(this.fd.onFace(f => this.faceCbs.forEach(cb => cb(f))))
    if (videoEl) {
      this.fd.init()
        .then(() => navigator.mediaDevices.getUserMedia({ video: true }))
        .then(stream => {
          this.stream = stream
          videoEl.srcObject = stream
          videoEl.muted = true
          videoEl.playsInline = true
          return videoEl.play().then(() => {
            this.fd.start(videoEl)
            this.cameraStatusCbs.forEach(cb => cb(true))
          })
        })
        .catch(() => this.cameraStatusCbs.forEach(cb => cb(false)))
    } else {
      this.cameraStatusCbs.forEach(cb => cb(null))
    }
  }

  // ── Disconnect ────────────────────────────────────────────────────────────

  disconnect() {
    this.gl.disconnect()
    this.cleanups.forEach(fn => fn())
    this.cleanups = []
    this.fd.stop()
    this.stream?.getTracks().forEach(t => t.stop())
    this.stream = null
  }
}
