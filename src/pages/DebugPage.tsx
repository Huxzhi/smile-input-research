import { useState, useEffect, useRef, useCallback } from 'react'
import { InputController } from '../core/InputController'
import { useGazeInput } from '../core/useGazeInput'
import { GazeCursor } from '../components/GazeCursor'
import { FaceDebugPanel } from '../components/FaceDebugPanel'
import { QwertyKeyboard, computeQwertyKeySize } from '../components/keyboards/QwertyKeyboard'
import { OptiKeyboard, computeOptiKeySize } from '../components/keyboards/OptiKeyboard'
import { useI18n } from '../i18n'
import type { EventLog, InputMethod, Layout } from '../types'
import { PHRASES } from '../data/phrases'

const METHOD_ZH: Record<InputMethod, string> = { dwell: '注视', blink: '眨眼', smile: '微笑' }
const randomPhrase = () => PHRASES[Math.floor(Math.random() * PHRASES.length)]

const BOTTOM_H = 280
const PANEL_W  = 212
const OFFSET_STEP = 0.01

interface Props {
  onExport: () => void
  displayLogs: EventLog[]
  addLog: (log: EventLog) => void
  clearLogs: () => void
  onStart: (offsetX: number, offsetY: number, gazeMode: 'tobii' | 'mouse') => void
}

export function DebugPage({ onExport, displayLogs, addLog: addLogProp, clearLogs, onStart }: Props) {
  const { t, lang, setLang } = useI18n()
  const [layout, setLayout]           = useState<Layout>('qwerty')
  const [offsetX, setOffsetX]         = useState(0)
  const [offsetY, setOffsetY]         = useState(0)
  const [gazeMode, setGazeMode]       = useState<'tobii' | 'mouse'>('tobii')
  const [inputMethod, setInputMethod] = useState<InputMethod>('dwell')
  const [smileThreshold, setSmileThreshold] = useState(0.6)
  const [blinkMinMs, setBlinkMinMs]         = useState(150)
  const [blinkMaxMs, setBlinkMaxMs]         = useState(300)
  const [phrase, setPhrase]           = useState(randomPhrase)
  const [typedChars, setTypedChars]   = useState<string[]>([])
  const [participantId, setParticipantId] = useState('')
  const [isTutorial, setIsTutorial]   = useState(false)
  const [, forceUpdate]               = useState(0)

  const cursorRef      = useRef<HTMLDivElement>(null)
  const videoRef       = useRef<HTMLVideoElement>(null)
  const controllerRef  = useRef<InputController | null>(new InputController('dwell'))
  const phraseRef      = useRef(phrase)
  phraseRef.current    = phrase
  const charIndexRef   = useRef(0)

  // Refs so callbacks always see current context values
  const layoutRef       = useRef(layout)
  const participantRef  = useRef(participantId)
  const isTutorialRef   = useRef(isTutorial)
  const inputMethodRef  = useRef(inputMethod)
  layoutRef.current      = layout
  participantRef.current = participantId
  isTutorialRef.current  = isTutorial
  inputMethodRef.current = inputMethod

  const addLog = useCallback((entry: Omit<EventLog, 'sessionId' | 'participantId' | 'layout' | 'isTutorial'>) => {
    addLogProp({
      ...entry,
      sessionId:     'debug',
      participantId: participantRef.current || undefined,
      layout:        layoutRef.current,
      isTutorial:    isTutorialRef.current,
    })
  }, [addLogProp])

  const formatTs = (ts: number) => {
    const d = new Date(ts)
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}.${String(d.getMilliseconds()).padStart(3,'0')}`
  }

  // Log initial phrase on mount
  useEffect(() => {
    addLog({ ts: Date.now(), type: 'phrase_show', description: `初始短语: "${phrase}"` })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const { gaze, faceEvent, gazeStatus, handleKeyRect, resetHitTracking } = useGazeInput({
    gazeMode,
    offsetX,
    offsetY,
    videoRef,
    cursorRef,
    controllerRef,
  })

  // Recreate controller when input method / layout / threshold changes
  useEffect(() => {
    resetHitTracking()
    charIndexRef.current = 0
    setTypedChars([])

    const ctrl = new InputController(inputMethod, smileThreshold, blinkMinMs, blinkMaxMs)
    controllerRef.current = ctrl

    const unsub = ctrl.onInput(fired => {
      if (fired.key === 'BACKSPACE') {
        if (charIndexRef.current > 0) {
          charIndexRef.current--
          setTypedChars(prev => prev.slice(0, -1))
          forceUpdate(n => n + 1)
        }
        return
      }
      if (charIndexRef.current >= phraseRef.current.length) return
      const ch = fired.key === 'SPACE' ? ' ' : fired.key.toLowerCase()
      const target = phraseRef.current[charIndexRef.current]
      const isCorrect = ch === target
      charIndexRef.current++
      setTypedChars(prev => [...prev, ch])
      forceUpdate(n => n + 1)

      addLog({
        ts:              fired.ts,
        type:            'char_input',
        description:     `"${fired.key}" → 目标"${target}" ${isCorrect ? '✓' : '✗'}`,
        inputMethod:     inputMethodRef.current,
        key:             fired.key,
        isCorrect,
        gazeX:           fired.gazeX,
        gazeY:           fired.gazeY,
        smileScore:      fired.smileScore,
        mouthSmileLeft:  fired.mouthSmileLeft,
        mouthSmileRight: fired.mouthSmileRight,
        eyeSquintLeft:   fired.eyeSquintLeft,
        eyeSquintRight:  fired.eyeSquintRight,
        blinkDuration:   fired.blinkDuration,
      })

      if (charIndexRef.current >= phraseRef.current.length) {
        setTimeout(() => {
          const next = randomPhrase()
          setPhrase(next)
          setTypedChars([])
          charIndexRef.current = 0
          addLog({ ts: Date.now(), type: 'phrase_show', description: `新短语: "${next}"` })
        }, 600)
      }
    })

    return unsub
  }, [inputMethod, layout, smileThreshold, blinkMinMs, blinkMaxMs, addLog, resetHitTracking])

  const ctrl = controllerRef.current
  const currentTargetChar = phrase[typedChars.length] ?? ''
  const kbAvailW = window.innerWidth - 48
  const kbAvailH = window.innerHeight - BOTTOM_H - 88

  const gazeColor = gazeMode === 'mouse' ? '#bd93f9'
    : gazeStatus === 'ok' ? '#50fa7b' : gazeStatus === 'error' ? '#ff6b6b' : '#555'

  const pct = (v?: number) => v !== undefined ? `${(v * 100).toFixed(0)}%` : '-'

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#0d1117', color: '#cdd6f4', fontFamily: 'system-ui, sans-serif' }}>
      <video ref={videoRef} style={{ display: 'none' }} />
      <GazeCursor ref={cursorRef} />

      {/* ── Top: phrase + keyboard ───────────────────────────────── */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 10, gap: 6 }}>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <div style={{ fontSize: 18, letterSpacing: 2, fontFamily: 'monospace', padding: '8px 20px', background: '#0d1117', borderRadius: 6, border: '1px solid #21262d' }}>
            {phrase.split('').map((ch, i) => {
              const typed = typedChars[i]
              const isTyped = i < typedChars.length
              const isCurrent = i === typedChars.length
              return (
                <span key={i} style={{
                  color: isTyped ? (typed === ch ? '#50fa7b' : '#ff5555') : isCurrent ? '#fff' : '#444',
                  fontWeight: isCurrent ? 'bold' : 'normal',
                  textDecoration: isCurrent ? 'underline' : 'none',
                }}>
                  {ch === ' ' ? ' ' : ch}
                </span>
              )
            })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 11, color: '#444', fontFamily: 'monospace' }}>{typedChars.length}/{phrase.length}</span>
            {inputMethod === 'smile' && ctrl && (
              <span style={{ fontSize: 12, color: '#f1fa8c' }}>
                😊 {(ctrl.getSmileScore() * 100).toFixed(0)}%
                {ctrl.getLockedKey() && <span style={{ marginLeft: 8 }}>🔒 {ctrl.getLockedKey()}</span>}
              </span>
            )}
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
          {layout === 'qwerty' ? (
            <QwertyKeyboard controller={ctrl} gaze={gaze} targetChar={currentTargetChar}
              onKeyRect={handleKeyRect} keySize={computeQwertyKeySize(kbAvailW, kbAvailH)} />
          ) : (
            <OptiKeyboard controller={ctrl} gaze={gaze} targetChar={currentTargetChar}
              onKeyRect={handleKeyRect} keySize={computeOptiKeySize(kbAvailW, kbAvailH)} />
          )}
        </div>
      </div>

      {/* ── Bottom: controls+log (left) | camera (right) ─────────── */}
      <div style={{ height: BOTTOM_H, display: 'flex', borderTop: '1px solid #21262d', flexShrink: 0 }}>

        {/* Left panel */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', padding: '6px 10px', gap: 5, overflow: 'hidden' }}>

          {/* Controls row 1 */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', flexShrink: 0 }}>
            {/* Participant */}
            <span style={labelStyle}>参与者</span>
            <input
              value={participantId}
              onChange={e => setParticipantId(e.target.value)}
              placeholder="输入名字"
              style={inputStyle}
            />

            <div style={divider} />

            {/* Layout */}
            <span style={labelStyle}>布局</span>
            {(['qwerty', 'opti'] as const).map(l => (
              <button key={l} onClick={() => setLayout(l)} style={tabBtn(layout === l)}>
                {l.toUpperCase()}
              </button>
            ))}

            <div style={divider} />

            {/* Input method */}
            <span style={labelStyle}>方式</span>
            {(['dwell', 'blink', 'smile'] as InputMethod[]).map(m => (
              <button key={m} onClick={() => setInputMethod(m)} style={tabBtn(inputMethod === m)}>
                {METHOD_ZH[m]}
              </button>
            ))}

            <div style={divider} />

            {/* Tutorial toggle */}
            <button onClick={() => setIsTutorial(v => !v)} style={tabBtn(isTutorial)}>
              {isTutorial ? '教学模式' : '正式模式'}
            </button>

            <div style={divider} />

            {/* Gaze mode */}
            <button onClick={() => setGazeMode(m => m === 'tobii' ? 'mouse' : 'tobii')} style={tabBtn(gazeMode === 'mouse')}>
              {gazeMode === 'mouse' ? '鼠标' : 'Tobii'}
            </button>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: gazeColor, flexShrink: 0 }} />

            <div style={divider} />

            {/* Language */}
            {(['zh', 'ja', 'en'] as const).map(l => (
              <button key={l} onClick={() => setLang(l)} style={tabBtn(lang === l)}>
                {l === 'zh' ? '中文' : l === 'ja' ? 'JP' : 'EN'}
              </button>
            ))}

            <div style={divider} />

            <button onClick={() => onStart(offsetX, offsetY, gazeMode)} style={startBtnStyle}>
              开始实验 ▶
            </button>
          </div>

          {/* Controls row 2 */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', flexShrink: 0 }}>
            <span style={labelStyle}>偏移</span>
            <OffsetControl label="X" value={offsetX} onChange={setOffsetX} />
            <OffsetControl label="Y" value={offsetY} onChange={setOffsetY} />
            {(offsetX !== 0 || offsetY !== 0) && (
              <button onClick={() => { setOffsetX(0); setOffsetY(0) }} style={smallBtn}>重置</button>
            )}

            {inputMethod === 'smile' && (
              <>
                <div style={divider} />
                <span style={labelStyle}>笑阈值</span>
                <button onClick={() => setSmileThreshold(v => Math.max(0.1, Math.round((v - 0.05) * 100) / 100))} style={nudgeBtn}>−</button>
                <span style={{ color: '#f1fa8c', fontSize: 12, fontFamily: 'monospace', minWidth: 36, textAlign: 'center' }}>
                  {(smileThreshold * 100).toFixed(0)}%
                </span>
                <button onClick={() => setSmileThreshold(v => Math.min(1.0, Math.round((v + 0.05) * 100) / 100))} style={nudgeBtn}>+</button>
              </>
            )}

            {inputMethod === 'blink' && (
              <>
                <div style={divider} />
                <span style={labelStyle}>眨眼最短</span>
                <button onClick={() => setBlinkMinMs(v => Math.max(0, v - 10))} style={nudgeBtn}>−</button>
                <span style={{ color: '#f1fa8c', fontSize: 12, fontFamily: 'monospace', minWidth: 44, textAlign: 'center' }}>
                  {blinkMinMs}ms
                </span>
                <button onClick={() => setBlinkMinMs(v => Math.min(blinkMaxMs - 10, v + 10))} style={nudgeBtn}>+</button>
                <span style={labelStyle}>最长</span>
                <button onClick={() => setBlinkMaxMs(v => Math.max(blinkMinMs + 10, v - 10))} style={nudgeBtn}>−</button>
                <span style={{ color: '#f1fa8c', fontSize: 12, fontFamily: 'monospace', minWidth: 44, textAlign: 'center' }}>
                  {blinkMaxMs}ms
                </span>
                <button onClick={() => setBlinkMaxMs(v => Math.min(600, v + 10))} style={nudgeBtn}>+</button>
              </>
            )}

            <div style={divider} />
            <button onClick={() => { const next = randomPhrase(); setPhrase(next); setTypedChars([]); charIndexRef.current = 0; addLog({ ts: Date.now(), type: 'phrase_show', description: `换词: "${next}"` }) }} style={smallBtn}>换词</button>
            <button onClick={clearLogs} style={smallBtn}>清空log</button>
            <button onClick={onExport} style={{ ...smallBtn, color: '#50fa7b', borderColor: '#50fa7b33' }}>导出CSV</button>
          </div>

          {/* Log table */}
          <div style={{ flex: 1, minHeight: 0, overflow: 'auto', borderTop: '1px solid #21262d' }}>
            <table style={{ width: '100%', fontSize: 10.5, borderCollapse: 'collapse', fontFamily: 'monospace' }}>
              <thead style={{ position: 'sticky', top: 0, background: '#0d1117' }}>
                <tr style={{ color: '#555', borderBottom: '1px solid #21262d' }}>
                  <th style={th}>时间</th>
                  <th style={th}>参与者</th>
                  <th style={th}>布局</th>
                  <th style={th}>教学</th>
                  <th style={th}>方式</th>
                  <th style={th}>键</th>
                  <th style={{ ...th, textAlign: 'left' }}>描述</th>
                  <th style={th}>X</th>
                  <th style={th}>Y</th>
                  <th style={th}>微笑</th>
                  <th style={th}>左口角</th>
                  <th style={th}>右口角</th>
                  <th style={th}>左眼角</th>
                  <th style={th}>右眼角</th>
                  <th style={th}>眨眼ms</th>
                </tr>
              </thead>
              <tbody>
                {displayLogs.map((log, i) => {
                  const rowColor = log.type === 'phrase_show' ? '#f1fa8c'
                    : log.type === 'experiment_start' ? '#50fa7b'
                    : log.isCorrect ? '#8be9fd' : '#ff5555'
                  return (
                    <tr key={i} style={{ color: rowColor, borderBottom: '1px solid #161b22' }}>
                      <td style={td}>{formatTs(log.ts)}</td>
                      <td style={td}>{log.participantId ?? '-'}</td>
                      <td style={td}>{log.layout ?? '-'}</td>
                      <td style={td}>{log.isTutorial ? '✓' : '-'}</td>
                      <td style={td}>{log.inputMethod ?? '-'}</td>
                      <td style={td}>{log.key ?? '-'}</td>
                      <td style={{ ...td, textAlign: 'left' }}>{log.description}</td>
                      <td style={td}>{log.gazeX !== undefined ? log.gazeX.toFixed(3) : '-'}</td>
                      <td style={td}>{log.gazeY !== undefined ? log.gazeY.toFixed(3) : '-'}</td>
                      <td style={td}>{pct(log.smileScore)}</td>
                      <td style={td}>{pct(log.mouthSmileLeft)}</td>
                      <td style={td}>{pct(log.mouthSmileRight)}</td>
                      <td style={td}>{pct(log.eyeSquintLeft)}</td>
                      <td style={td}>{pct(log.eyeSquintRight)}</td>
                      <td style={td}>{log.blinkDuration != null ? log.blinkDuration : '-'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right panel: camera + face metrics */}
        <div style={{ width: PANEL_W, borderLeft: '1px solid #21262d', flexShrink: 0, overflow: 'hidden' }}>
          <FaceDebugPanel videoRef={videoRef} faceEvent={faceEvent} gaze={gaze} embedded />
        </div>
      </div>
    </div>
  )
}

function OffsetControl({ label, value, onChange }: {
  label: string; value: number; onChange: (v: number) => void
}) {
  const clamp = (v: number) => Math.max(-0.3, Math.min(0.3, Math.round(v * 1000) / 1000))
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
      <span style={{ color: '#555', fontSize: 11 }}>{label}</span>
      <button onClick={() => onChange(clamp(value - OFFSET_STEP))} style={nudgeBtn}>−</button>
      <span style={{ color: '#f1fa8c', fontSize: 11, fontFamily: 'monospace', minWidth: 48, textAlign: 'center' }}>
        {value >= 0 ? '+' : ''}{(value * 100).toFixed(1)}%
      </span>
      <button onClick={() => onChange(clamp(value + OFFSET_STEP))} style={nudgeBtn}>+</button>
    </div>
  )
}

const labelStyle:  React.CSSProperties = { color: '#444', fontSize: 11, flexShrink: 0 }
const divider:     React.CSSProperties = { width: 1, height: 16, background: '#21262d', flexShrink: 0 }
const inputStyle:  React.CSSProperties = {
  padding: '2px 6px', borderRadius: 4, border: '1px solid #21262d',
  background: '#111827', color: '#cdd6f4', fontSize: 11, width: 90, outline: 'none',
}
const tabBtn = (active: boolean): React.CSSProperties => ({
  padding: '3px 10px', borderRadius: 4,
  border: `1px solid ${active ? '#5a7aff' : '#21262d'}`,
  background: active ? '#1e1e4e' : 'transparent',
  color: active ? '#cdd6f4' : '#444',
  cursor: 'pointer', fontSize: 11,
})
const nudgeBtn: React.CSSProperties = {
  width: 20, height: 20, borderRadius: 3, border: '1px solid #21262d',
  background: '#111827', color: '#bbb', cursor: 'pointer', fontSize: 13,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
}
const smallBtn: React.CSSProperties = {
  padding: '3px 8px', borderRadius: 4, border: '1px solid #21262d',
  background: 'transparent', color: '#444', cursor: 'pointer', fontSize: 11,
}
const startBtnStyle: React.CSSProperties = {
  padding: '4px 16px', borderRadius: 5, border: 'none',
  background: '#5a7aff', color: '#fff', fontSize: 12, cursor: 'pointer',
}
const th: React.CSSProperties = { padding: '2px 5px', textAlign: 'center', fontWeight: 600, whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '1px 5px', textAlign: 'center', whiteSpace: 'nowrap' }
