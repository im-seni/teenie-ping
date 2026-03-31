import { useState } from 'react'

const LS_PREFIX = 'myping-dashboard:insight:'

function newId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function loadItems(storageKey) {
  const key = LS_PREFIX + storageKey
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function InsightMemoBlock({ storageKey }) {
  const key = LS_PREFIX + storageKey
  const [items, setItems] = useState(() => loadItems(storageKey))
  const [draft, setDraft] = useState('')

  const save = next => {
    setItems(next)
    try {
      localStorage.setItem(key, JSON.stringify(next))
    } catch {
      /* quota or private mode */
    }
  }

  const add = () => {
    const text = draft.trim()
    if (!text) return
    save([...items, { id: newId(), text, at: Date.now() }])
    setDraft('')
  }

  const remove = id => save(items.filter(x => x.id !== id))

  return (
    <div style={{ marginTop: '10px' }}>
      <div style={{ fontSize: '11px', color: '#6b6b65', marginBottom: '6px' }}>인사이트 메모</div>
      {items.length > 0 && (
        <ul
          style={{
            listStyle: 'none',
            margin: '0 0 10px 0',
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          {items.map(m => (
            <li
              key={m.id}
              style={{
                display: 'flex',
                gap: '8px',
                alignItems: 'flex-start',
                padding: '8px 10px',
                background: '#fafaf7',
                border: '1px solid #e2e0d8',
                borderRadius: '6px',
                fontSize: '12px',
                color: '#1a1a18',
                lineHeight: 1.5,
              }}
            >
              <span style={{ flex: 1, wordBreak: 'break-word' }}>{m.text}</span>
              <button
                type="button"
                onClick={() => remove(m.id)}
                style={{
                  flexShrink: 0,
                  fontSize: '10px',
                  color: '#6b6b65',
                  background: 'none',
                  border: '1px solid #e2e0d8',
                  borderRadius: '4px',
                  padding: '2px 8px',
                  cursor: 'pointer',
                }}
              >
                삭제
              </button>
            </li>
          ))}
        </ul>
      )}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="메모 내용 입력"
          rows={2}
          style={{
            flex: '1 1 180px',
            minWidth: '160px',
            border: '1px solid #e2e0d8',
            borderRadius: '6px',
            padding: '8px 10px',
            fontSize: '12px',
            fontFamily: 'inherit',
            color: '#1a1a18',
            background: '#fff',
            resize: 'vertical',
            minHeight: '48px',
          }}
        />
        <button
          type="button"
          onClick={add}
          style={{
            fontSize: '12px',
            fontWeight: 600,
            color: '#fff',
            background: '#534AB7',
            border: 'none',
            borderRadius: '6px',
            padding: '8px 14px',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          메모 추가
        </button>
      </div>
    </div>
  )
}
