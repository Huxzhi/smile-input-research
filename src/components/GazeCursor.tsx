import { forwardRef } from 'react'

/**
 * A fixed-position dot whose transform is driven directly by GazeLayer's RAF loop.
 * left/top are offset by half the size so the dot centres on the gaze point.
 */
export const GazeCursor = forwardRef<HTMLDivElement>(function GazeCursor(_, ref) {
  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left: -12,
        top: -12,
        width: 24,
        height: 24,
        borderRadius: '50%',
        border: '2px solid rgba(255, 107, 107, 0.85)',
        background: 'rgba(255, 107, 107, 0.15)',
        pointerEvents: 'none',
        zIndex: 9999,
        willChange: 'transform',
        transition: 'opacity 60ms ease',
      }}
    />
  )
})
