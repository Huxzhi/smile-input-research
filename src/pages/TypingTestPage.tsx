import { useState, useRef, useEffect } from 'react'
import { PHRASES } from '../data/phrases'

interface Props {
  onNext: () => void
}

// Pick a phrase of moderate length for the test
const TEST_PHRASE = PHRASES.find(p => p.length >= 22 && p.length <= 32) ?? PHRASES[4]

export function TypingTestPage({ onNext }: Props) {
  const [input, setInput] = useState('')
  const [startTime, setStartTime] = useState<number | null>(null)
  const [endTime, setEndTime] = useState<number | null>(null)
  const [skipped, setSkipped] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (endTime) return
    const val = e.target.value
    if (!startTime && val.length > 0) setStartTime(Date.now())
    setInput(val)
    if (val === TEST_PHRASE) setEndTime(Date.now())
  }

  const wpm = startTime && endTime
    ? Math.round((TEST_PHRASE.length / 5) / ((endTime - startTime) / 60000))
    : null

  const accuracy = input.length > 0
    ? Math.round([...TEST_PHRASE].filter((c, i) => c === input[i]).length / TEST_PHRASE.length * 100)
    : null

  const canProceed = input === TEST_PHRASE || skipped

  return (
    <div style={centerStyle}>
      <h2 style={{ fontSize: 24, marginBottom: 4 }}>Typing Proficiency Check</h2>
      <p style={{ color: '#888', marginBottom: 24, textAlign: 'center' }}>
        Type the phrase below exactly, or check the box to skip.
      </p>

      {/* Phrase with per-character highlighting */}
      <div style={{
        fontFamily: 'monospace',
        fontSize: 22,
        background: '#1a1a2e',
        padding: '16px 24px',
        borderRadius: 8,
        letterSpacing: 1,
        marginBottom: 16,
        maxWidth: 600,
        lineHeight: 1.6,
      }}>
        {[...TEST_PHRASE].map((char, i) => {
          const typed = input[i]
          let color = '#888'
          if (typed !== undefined) color = typed === char ? '#a6e3a1' : '#f38ba8'
          return <span key={i} style={{ color }}>{char}</span>
        })}
      </div>

      {/* Input field */}
      <input
        ref={inputRef}
        value={input}
        onChange={handleChange}
        disabled={!!endTime}
        placeholder="Start typing here..."
        style={{
          fontFamily: 'monospace',
          fontSize: 18,
          padding: '10px 16px',
          borderRadius: 6,
          border: `1px solid ${endTime ? '#a6e3a1' : '#444'}`,
          background: '#1a1a2e',
          color: '#fff',
          width: 560,
          outline: 'none',
        }}
      />

      {/* Results */}
      {wpm !== null && accuracy !== null && (
        <div style={{ display: 'flex', gap: 32, marginTop: 8 }}>
          <Stat label="WPM" value={wpm} />
          <Stat label="Accuracy" value={`${accuracy}%`} />
        </div>
      )}

      {/* Skip checkbox */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', color: '#cdd6f4', marginTop: 12 }}>
        <input
          type="checkbox"
          checked={skipped}
          onChange={e => setSkipped(e.target.checked)}
          style={{ width: 18, height: 18, cursor: 'pointer' }}
        />
        I am already proficient with QWERTY keyboard
      </label>

      <button
        onClick={onNext}
        disabled={!canProceed}
        style={{
          marginTop: 8,
          padding: '12px 48px',
          borderRadius: 8,
          border: 'none',
          background: canProceed ? '#5a7aff' : '#333',
          color: canProceed ? '#fff' : '#666',
          fontSize: 16,
          cursor: canProceed ? 'pointer' : 'not-allowed',
        }}
      >
        Continue
      </button>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: '#a6e3a1' }}>{value}</div>
      <div style={{ fontSize: 13, color: '#888' }}>{label}</div>
    </div>
  )
}

const centerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '100vh',
  gap: 16,
}
