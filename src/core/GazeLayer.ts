import type { GazePoint } from '../types'

type GazeCallback = (point: GazePoint) => void

// Lerp factor per frame at ~60 fps. 0.15 ≈ 90% of distance covered in ~15 frames (~250 ms).
const LERP = 0.15

export class GazeLayer {
  private ws: WebSocket | null = null
  private callbacks: GazeCallback[] = []
  private errorCbs: Array<() => void> = []
  private mouseCleanup: (() => void) | null = null

  // Smooth cursor state
  private targetX = 0
  private targetY = 0
  private smoothX = 0
  private smoothY = 0
  private eyeOpen = true
  private cursorEl: HTMLElement | null = null
  private rafId: number | null = null

  // Gaze offset (normalized 0–1, applied before callbacks and cursor)
  private offsetX = 0
  private offsetY = 0

  constructor(private url: string) {}

  setOffset(dx: number, dy: number) {
    this.offsetX = dx
    this.offsetY = dy
  }

  onError(cb: () => void) {
    this.errorCbs.push(cb)
    return () => { this.errorCbs = this.errorCbs.filter(c => c !== cb) }
  }

  connect() {
    this.ws = new WebSocket(this.url)
    this.ws.onerror = () => { this.errorCbs.forEach(cb => cb()) }
    this.ws.onmessage = (e) => {
      try {
        const raw = JSON.parse(e.data)
        const data: GazePoint = {
          x: raw.x,
          y: raw.y,
          ts: raw.ts,
          eyeOpen: raw.eye_open,
          leftOpen: raw.left_open,
          rightOpen: raw.right_open,
        }
        this.handleMessage(data)
      } catch {}
    }
    this.startRender()
  }

  connectMouse() {
    let leftDown = false
    let rightDown = false
    let lastX = 0.5
    let lastY = 0.5

    const emit = () => {
      this.handleMessage({
        x: lastX,
        y: lastY,
        ts: Date.now(),
        eyeOpen: !leftDown && !rightDown,
        leftOpen: !leftDown,
        rightOpen: !rightDown,
      })
    }

    const onMove = (e: MouseEvent) => {
      lastX = e.clientX / window.innerWidth
      lastY = e.clientY / window.innerHeight
      emit()
    }
    const onDown = (e: MouseEvent) => {
      if (e.button === 0) leftDown = true
      else if (e.button === 2) rightDown = true
      emit()
    }
    const onUp = (e: MouseEvent) => {
      if (e.button === 0) leftDown = false
      else if (e.button === 2) rightDown = false
      emit()
    }
    const onContext = (e: Event) => e.preventDefault()

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mousedown', onDown)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('contextmenu', onContext)

    this.mouseCleanup = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('contextmenu', onContext)
    }
    this.startRender()
  }

  disconnect() {
    this.ws?.close()
    this.ws = null
    if (this.mouseCleanup) {
      this.mouseCleanup()
      this.mouseCleanup = null
    }
    this.stopRender()
  }

  isMouseMode(): boolean {
    return this.mouseCleanup !== null
  }

  /** Bind a DOM element whose transform GazeLayer will drive each frame. */
  setCursorElement(el: HTMLElement | null) {
    this.cursorEl = el
    if (el) {
      // Snap immediately so the cursor doesn't slide in from (0, 0)
      this.smoothX = this.targetX
      this.smoothY = this.targetY
      el.style.transform = `translate(${this.smoothX}px, ${this.smoothY}px)`
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  onGaze(cb: GazeCallback) {
    this.callbacks.push(cb)
    return () => { this.callbacks = this.callbacks.filter(c => c !== cb) }
  }

  toPixel(point: GazePoint, screenW: number, screenH: number) {
    return { x: Math.round(point.x * screenW), y: Math.round(point.y * screenH) }
  }

  private handleMessage(data: GazePoint) {
    const adjX = Math.max(0, Math.min(1, data.x + this.offsetX))
    const adjY = Math.max(0, Math.min(1, data.y + this.offsetY))
    this.targetX = adjX * window.innerWidth
    this.targetY = adjY * window.innerHeight
    this.eyeOpen = data.eyeOpen ?? true
    const adjusted: GazePoint = { ...data, x: adjX, y: adjY }
    for (const cb of this.callbacks) cb(adjusted)
  }

  private startRender() {
    const render = () => {
      this.smoothX += (this.targetX - this.smoothX) * LERP
      this.smoothY += (this.targetY - this.smoothY) * LERP

      if (this.cursorEl) {
        this.cursorEl.style.transform =
          `translate(${Math.round(this.smoothX)}px, ${Math.round(this.smoothY)}px)`
        this.cursorEl.style.opacity = this.eyeOpen ? '1' : '0'
      }

      this.rafId = requestAnimationFrame(render)
    }
    this.rafId = requestAnimationFrame(render)
  }

  private stopRender() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }
}
