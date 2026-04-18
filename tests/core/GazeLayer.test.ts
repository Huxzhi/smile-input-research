import { describe, it, expect } from 'vitest'
import { GazeLayer } from '../../src/core/GazeLayer'

describe('GazeLayer', () => {
  it('normalizes gaze coords from WebSocket message', () => {
    const layer = new GazeLayer('ws://localhost:7070')
    const points: { x: number; y: number; ts: number }[] = []
    layer.onGaze((p) => points.push(p))

    // Simulate receiving a message
    layer['handleMessage']({ x: 0.3, y: 0.7, ts: 1000 })
    expect(points).toHaveLength(1)
    expect(points[0]).toEqual({ x: 0.3, y: 0.7, ts: 1000 })
  })

  it('converts normalized coords to pixel position', () => {
    const layer = new GazeLayer('ws://localhost:7070')
    const px = layer.toPixel({ x: 0.5, y: 0.5, ts: 0 }, 1920, 1080)
    expect(px).toEqual({ x: 960, y: 540 })
  })
})
