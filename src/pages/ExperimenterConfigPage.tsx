import { useState, useEffect } from 'react'
import { v4 as uuid } from 'uuid'
import type { ConditionConfig, EventLog, ExperimenterConfig } from '../types'
import { PHRASES_PER_CONDITION } from '../types'
import { ExperimentManager } from '../core/ExperimentManager'

interface Props {
  gazeMode: 'tobii' | 'mouse'
  addLog: (log: EventLog) => void
  onNext: (participantId: string, sessionId: string, config: ExperimenterConfig) => void
  onBack: () => void
}

const METHOD_COLOR: Record<string, string> = {
  dwell: '#4a90e2',
  blink: '#e2844a',
  smile: '#50fa7b',
}
const LAYOUT_COLOR: Record<string, string> = {
  qwerty: '#5a7aff',
  opti:   '#f1a740',
}
const METHOD_ZH: Record<string, string> = {
  dwell: '注视',
  blink: '眨眼',
  smile: '微笑',
}

export function ExperimenterConfigPage({ gazeMode, addLog, onNext, onBack }: Props) {
  const [experimenterName, setExperimenterName] = useState('')
  const [participantId, setParticipantId]       = useState('')
  const [ppc, setPpc]                           = useState(PHRASES_PER_CONDITION)
  const [conditions, setConditions]             = useState<ConditionConfig[]>([])
  const [startIdx, setStartIdx]                 = useState(0)   // 0-based condition
  const [startPhrase, setStartPhrase]           = useState(1)   // 1-based UI

  // Auto-populate once when participantId first becomes non-empty
  useEffect(() => {
    if (participantId && conditions.length === 0) {
      setConditions(new ExperimentManager(participantId).getConditionOrder())
    }
  }, [participantId, conditions.length])

  const applyLatinSquare = () => {
    if (!participantId) return
    setConditions(new ExperimentManager(participantId).getConditionOrder())
    setStartIdx(0)
    setStartPhrase(1)
  }

  const moveUp = (i: number) => {
    if (i === 0) return
    const next = [...conditions]
    ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
    setConditions(next)
    if (startIdx === i) setStartIdx(i - 1)
    else if (startIdx === i - 1) setStartIdx(i)
  }

  const moveDown = (i: number) => {
    if (i === conditions.length - 1) return
    const next = [...conditions]
    ;[next[i], next[i + 1]] = [next[i + 1], next[i]]
    setConditions(next)
    if (startIdx === i) setStartIdx(i + 1)
    else if (startIdx === i + 1) setStartIdx(i)
  }

  const canStart = experimenterName.trim() && participantId.trim() && conditions.length > 0

  const handleStart = () => {
    if (!canStart) return
    const sessionId = uuid()
    const config: ExperimenterConfig = {
      experimenterName: experimenterName.trim(),
      conditionOrder: conditions,
      startConditionIndex: startIdx,
      startPhraseIndex: startPhrase - 1,  // 0-based
      phrasesPerCondition: ppc,
    }
    const orderStr = conditions.map(c => `${c.layout}/${c.inputMethod}`).join(', ')
    addLog({
      sessionId,
      ts: Date.now(),
      type: 'experiment_start',
      description: `实验者:${config.experimenterName} P${participantId.trim()} 顺序:[${orderStr}] 起始:条件${startIdx + 1}语句${startPhrase} 每条件${ppc}句`,
      participantId: participantId.trim(),
      experimenterName: config.experimenterName,
      conditionOrder: JSON.stringify(conditions),
      startConditionIndex: startIdx,
      startPhraseIndex: config.startPhraseIndex,
      phrasesPerCondition: ppc,
      gazeMode,
    })
    onNext(participantId.trim(), sessionId, config)
  }

  return (
    <div style={pageStyle}>
      <h2 style={{ margin: '0 0 24px', fontSize: 22, color: '#cdd6f4' }}>实验配置</h2>

      {/* Block 1 — Basic info */}
      <div style={cardStyle}>
        <div style={rowStyle}>
          <label style={labelStyle}>实验者姓名</label>
          <input
            value={experimenterName}
            onChange={e => setExperimenterName(e.target.value)}
            placeholder="请输入姓名"
            style={inputStyle}
          />
          <label style={{ ...labelStyle, marginLeft: 32 }}>每条件语句数</label>
          <input
            type="number"
            min={1}
            max={30}
            value={ppc}
            onChange={e => setPpc(Math.max(1, Math.min(30, Number(e.target.value))))}
            style={{ ...inputStyle, width: 72 }}
          />
        </div>
        <div style={rowStyle}>
          <label style={labelStyle}>参与者 ID</label>
          <input
            value={participantId}
            onChange={e => setParticipantId(e.target.value)}
            placeholder="数字 ID"
            style={{ ...inputStyle, width: 120 }}
          />
          <button
            onClick={applyLatinSquare}
            disabled={!participantId}
            style={{
              ...btnStyle,
              marginLeft: 16,
              background: participantId ? '#1e2a4a' : '#1a1a2e',
              color: participantId ? '#8be9fd' : '#555',
              border: `1px solid ${participantId ? '#2a5080' : '#333'}`,
            }}
          >
            使用拉丁方推荐顺序
          </button>
        </div>
      </div>

      {/* Block 2 — Condition table */}
      {conditions.length > 0 && (
        <div style={cardStyle}>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 10 }}>
            条件顺序（可调整，点击行首设为起始条件）
          </div>
          {conditions.map((cond, i) => {
            const isStart = i === startIdx
            return (
              <div
                key={i}
                onClick={() => { setStartIdx(i); setStartPhrase(1) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 10px', borderRadius: 6, marginBottom: 4,
                  background: isStart ? '#0e1e3a' : '#0d1117',
                  border: `1px solid ${isStart ? '#2a5080' : '#1e2430'}`,
                  cursor: 'pointer',
                  transition: 'all 150ms',
                }}
              >
                {/* Start marker */}
                <span style={{ width: 14, color: '#5a7aff', fontSize: 13, flexShrink: 0 }}>
                  {isStart ? '▶' : ''}
                </span>

                {/* Up / Down */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <button onClick={e => { e.stopPropagation(); moveUp(i) }}
                    disabled={i === 0}
                    style={arrowBtn}>↑</button>
                  <button onClick={e => { e.stopPropagation(); moveDown(i) }}
                    disabled={i === conditions.length - 1}
                    style={arrowBtn}>↓</button>
                </div>

                {/* Condition number */}
                <span style={{ width: 36, fontSize: 12, color: '#666' }}>#{i + 1}</span>

                {/* Layout badge */}
                <span style={{
                  padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600,
                  background: LAYOUT_COLOR[cond.layout] + '22',
                  color: LAYOUT_COLOR[cond.layout],
                  border: `1px solid ${LAYOUT_COLOR[cond.layout]}44`,
                  width: 64, textAlign: 'center',
                }}>
                  {cond.layout.toUpperCase()}
                </span>

                {/* Method badge */}
                <span style={{
                  padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600,
                  background: METHOD_COLOR[cond.inputMethod] + '22',
                  color: METHOD_COLOR[cond.inputMethod],
                  border: `1px solid ${METHOD_COLOR[cond.inputMethod]}44`,
                  width: 56, textAlign: 'center',
                }}>
                  {METHOD_ZH[cond.inputMethod]}
                </span>

                {/* Start phrase input (only on start row) */}
                {isStart && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 8 }}
                    onClick={e => e.stopPropagation()}>
                    <span style={{ fontSize: 12, color: '#8be9fd' }}>起始语句</span>
                    <input
                      type="number"
                      min={1}
                      max={ppc}
                      value={startPhrase}
                      onChange={e => setStartPhrase(Math.max(1, Math.min(ppc, Number(e.target.value))))}
                      style={{ ...inputStyle, width: 60, padding: '4px 8px' }}
                    />
                    <span style={{ fontSize: 12, color: '#555' }}>/ {ppc}</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {conditions.length === 0 && participantId && (
        <div style={{ color: '#555', fontSize: 13, margin: '8px 0' }}>
          输入参与者 ID 后点击"使用拉丁方推荐顺序"生成条件
        </div>
      )}

      {/* Block 3 — Action bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24, width: '100%', maxWidth: 680 }}>
        <button onClick={onBack} style={{ ...btnStyle, color: '#666', background: 'transparent', border: '1px solid #333' }}>
          ← 返回调试
        </button>
        <button
          onClick={handleStart}
          disabled={!canStart}
          style={{
            ...btnStyle,
            background: canStart ? '#5a7aff' : '#1e1e2e',
            color: canStart ? '#fff' : '#444',
            border: 'none',
            padding: '12px 40px',
            fontSize: 16,
          }}
        >
          开始实验 →
        </button>
      </div>
    </div>
  )
}

const pageStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center',
  minHeight: '100vh', padding: '40px 24px', gap: 16,
}
const cardStyle: React.CSSProperties = {
  width: '100%', maxWidth: 680, background: '#0d1117',
  border: '1px solid #1e2430', borderRadius: 8, padding: '16px 20px',
  display: 'flex', flexDirection: 'column', gap: 12,
}
const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
}
const labelStyle: React.CSSProperties = {
  fontSize: 13, color: '#888', width: 80, flexShrink: 0,
}
const inputStyle: React.CSSProperties = {
  padding: '8px 12px', borderRadius: 6,
  border: '1px solid #2a3040', background: '#0a0d12',
  color: '#cdd6f4', fontSize: 14, outline: 'none', width: 200,
}
const btnStyle: React.CSSProperties = {
  padding: '8px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 13,
}
const arrowBtn: React.CSSProperties = {
  padding: '0 4px', lineHeight: '14px', fontSize: 11,
  background: 'transparent', border: '1px solid #2a3040',
  color: '#666', cursor: 'pointer', borderRadius: 3,
}
