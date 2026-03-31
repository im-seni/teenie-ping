export const BarList = ({
  counts,
  color = '#534AB7',
  max = 10,
  /** 설정 시 막대 길이·% = 이 값 대비 (양수 그룹 n 등). 없으면 기존처럼 목록 내 최댓값 대비 상대비율 */
  denominator = null,
}) => {
  const items = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
  const maxVal = items.length > 0 ? items[0][1] : 1
  const base = denominator != null && denominator > 0 ? denominator : maxVal

  if (!items.length) {
    return <div style={{ color: '#aaa', fontSize: '12px', marginTop: '8px' }}>데이터 없음</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
      {items.map(([label, value], idx) => {
        const w = base > 0 ? Math.min(100, Math.round((value / base) * 100)) : 0
        const pctLabel =
          denominator != null && denominator > 0
            ? Math.round((value / denominator) * 100)
            : w
        return (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                minWidth: '120px',
                fontSize: '11px',
                color: '#1a1a18',
                flexShrink: 0,
                wordBreak: 'break-word',
              }}
            >
              {label.length > 28 ? label.slice(0, 28) + '…' : label}
            </div>
            <div
              style={{
                flex: 1,
                background: '#f0efe8',
                borderRadius: '3px',
                height: '18px',
                position: 'relative',
                minWidth: '80px',
              }}
            >
              <div
                style={{
                  width: `${w}%`,
                  height: '100%',
                  background: color,
                  borderRadius: '3px',
                  display: 'flex',
                  alignItems: 'center',
                  paddingLeft: '6px',
                  color: '#fff',
                  fontSize: '10px',
                  fontWeight: '600',
                  minWidth: w > 18 ? 'auto' : '0',
                }}
              >
                {denominator != null && w > 14 ? `${pctLabel}%` : ''}
                {denominator == null && w > 15 ? `${w}%` : ''}
              </div>
            </div>
            <div
              style={{
                minWidth: '52px',
                fontSize: '11px',
                color: '#6b6b65',
                textAlign: 'right',
                flexShrink: 0,
              }}
            >
              {value}명
              {denominator != null && denominator > 0 && w <= 14 ? ` ${pctLabel}%` : ''}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export const BarListCompact = ({ counts, color = '#534AB7', max = 6, denominator = null }) => {
  const items = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
  const maxVal = items.length > 0 ? items[0][1] : 1
  const base = denominator != null && denominator > 0 ? denominator : maxVal

  if (!items.length) {
    return <div style={{ color: '#aaa', fontSize: '12px' }}>데이터 없음</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {items.map(([label, value], idx) => {
        const w = base > 0 ? Math.min(100, Math.round((value / base) * 100)) : 0
        return (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ minWidth: '100px', fontSize: '10px', color: '#1a1a18', flexShrink: 0 }}>
              {label.length > 15 ? label.slice(0, 15) + '…' : label}
            </div>
            <div
              style={{
                flex: 1,
                background: '#f0efe8',
                borderRadius: '3px',
                height: '14px',
                position: 'relative',
                minWidth: '60px',
              }}
            >
              <div style={{ width: `${w}%`, height: '100%', background: color, borderRadius: '3px' }}></div>
            </div>
            <div style={{ minWidth: '28px', fontSize: '10px', color: '#6b6b65', textAlign: 'right', flexShrink: 0 }}>
              {value}
            </div>
          </div>
        )
      })}
    </div>
  )
}
