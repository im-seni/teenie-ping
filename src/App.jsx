import { useState, useRef, useMemo } from 'react'
import { Bar, Doughnut } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement } from 'chart.js'
import * as XLSX from 'xlsx'
import { excelTrimKeyMap, normalizeRow, runCounts } from './dataUtils'
import { BarList } from './BarList'

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend)

/** (이전 단계 − 다음 단계) / 이전 단계 (%), 소수 1자리 — 분모 0이면 null */
function funnelDropoffPct(prev, next) {
  if (prev <= 0) return null
  return Math.round(((prev - next) / prev) * 1000) / 10
}

const TP_CONSUME_NAME_ONLY = '이름만 알고 별도의 소비 경험 없음'

function normalizeTpConsumeFragment(s) {
  return String(s)
    .split('(')[0]
    .trim()
    .replace(/\s+/g, ' ')
}

function tpConsumeFragments(raw) {
  if (raw == null || !String(raw).trim()) return []
  return String(raw)
    .split(',')
    .map(normalizeTpConsumeFragment)
    .filter(Boolean)
}

const REASON_DONUT_COLORS = ['#534AB7', '#1D9E75', '#EF9F27', '#D85A30', '#2E7DAF', '#8B5CF6', '#9CA3AF']
const CHAR_LIKERT_ORDER = ['전혀 관심 없음', '별로 관심 없음', '보통', '약간 관심 있음', '매우 관심 있음']
const CHAR_LIKERT_COLORS = {
  '전혀 관심 없음': '#c7c4bb',
  '별로 관심 없음': '#d9d6ce',
  '보통': '#b9c1d9',
  '약간 관심 있음': '#1D9E75',
  '매우 관심 있음': '#534AB7',
}

function toDonutRows(counts, max = 5) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1])
  if (!entries.length) return []
  const top = entries.slice(0, max)
  const rest = entries.slice(max).reduce((sum, [, v]) => sum + v, 0)
  const rows = top.map(([label, value], idx) => ({ label, value, color: REASON_DONUT_COLORS[idx % REASON_DONUT_COLORS.length] }))
  if (rest > 0) rows.push({ label: '기타', value: rest, color: '#C7C4BB' })
  return rows
}

function matchCharLikertLevel(raw) {
  const v = (raw || '').trim()
  if (!v) return null
  if (v.includes('전혀 관심 없음')) return '전혀 관심 없음'
  if (v.includes('별로 관심 없음')) return '별로 관심 없음'
  if (v.includes('약간 관심 있음')) return '약간 관심 있음'
  if (v.includes('매우 관심 있음')) return '매우 관심 있음'
  if (v.includes('보통')) return '보통'
  return null
}

export default function App() {
  const [rawData, setRawData] = useState([])
  const [filterAge, setFilterAge] = useState('all')
  const [filterGender, setFilterGender] = useState('all')
  const [filterSeg, setFilterSeg] = useState('all')
  const [behaviorMode, setBehaviorMode] = useState('all')
  const [noReasonEtcOpen, setNoReasonEtcOpen] = useState(false)
  const [mpPathConvOpen, setMpPathConvOpen] = useState(false)
  const [posCommFeatureEtcOpen, setPosCommFeatureEtcOpen] = useState(false)
  const [posCommReasonEtcOpen, setPosCommReasonEtcOpen] = useState(false)
  const [loadStatus, setLoadStatus] = useState('파일을 선택하세요.')
  const [ageOptions, setAgeOptions] = useState([])
  const fileInputRef = useRef(null)

  const loadData = () => {
    if (!fileInputRef.current?.files?.[0]) {
      setLoadStatus('파일을 선택하세요.')
      return
    }

    const file = fileInputRef.current.files[0]
    const reader = new FileReader()

    reader.onload = e => {
      const data = new Uint8Array(e.target.result)
      const wb = XLSX.read(data, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rawRows = XLSX.utils.sheet_to_json(ws, { defval: '' })

      if (!rawRows.length) {
        setLoadStatus('데이터 없음')
        return
      }

      const trimMap = excelTrimKeyMap(rawRows[0])
      const normalized = rawRows.map(row => normalizeRow(row, trimMap))
      setRawData(normalized)

      const ages = Array.from(new Set(normalized.map(r => r.age).filter(Boolean))).sort((a, b) => {
        // 어린 순서대로 정렬: 2007-2012, 2002-2006, 1996-2001
        const order = ['2007-2012년생', '2002-2006년생', '1996-2001년생'];
        return order.indexOf(a) - order.indexOf(b);
      });
      setAgeOptions(ages)

      setLoadStatus('로드 완료')
    }

    reader.readAsArrayBuffer(file)
  }

  const filtered = useMemo(() => rawData.filter(r =>
    (filterAge === 'all' || r.age === filterAge) &&
    (filterGender === 'all' || r.gender === filterGender) &&
    (filterSeg === 'all' || r.segment === filterSeg)
  ), [rawData, filterAge, filterGender, filterSeg])
  const filteredNoSeg = useMemo(
    () =>
      rawData.filter(
        r =>
          (filterAge === 'all' || r.age === filterAge) &&
          (filterGender === 'all' || r.gender === filterGender)
      ),
    [rawData, filterAge, filterGender]
  )

  // S0: Demographics
  const ageStats = useMemo(() => runCounts(filtered, 'age'), [filtered])
  const genderStats = useMemo(() => runCounts(filtered, 'gender'), [filtered])
  const segmentStats = useMemo(() => runCounts(filtered, 'segment'), [filtered])

  // S1: Funnel
  const tpKnowCnt = useMemo(() => filtered.filter(r => /안다/.test(r.tp_know)).length, [filtered])
  const mpKnowCnt = useMemo(() => filtered.filter(r => /알고/.test(r.mp_know)).length, [filtered])
  const mpBoughtCnt = useMemo(() => filtered.filter(r => /있다/.test(r.mp_bought)).length, [filtered])
  const mpRepurchaseCnt = useMemo(
    () => filtered.filter(r => /있다/.test(r.mp_will_buy_followup_raw)).length,
    [filtered]
  )
  const funnelDropoffs = useMemo(
    () => [
      {
        label: '티니핑 인지 → 마이핑 인지',
        rate: funnelDropoffPct(tpKnowCnt, mpKnowCnt),
      },
      {
        label: '마이핑 인지 → 마이핑 구매',
        rate: funnelDropoffPct(mpKnowCnt, mpBoughtCnt),
      },
      {
        label: '마이핑 구매 → 추가 구매 의향',
        rate: funnelDropoffPct(mpBoughtCnt, mpRepurchaseCnt),
      },
    ],
    [tpKnowCnt, mpKnowCnt, mpBoughtCnt, mpRepurchaseCnt]
  )
  const mpWillCnt = useMemo(() => filtered.filter(r => !/있다/.test(r.mp_bought) && /있다/.test(r.mp_will_buy)).length, [filtered])
  const mpKnowStats = useMemo(() => runCounts(filtered, 'mp_know'), [filtered])
  const mpIntentStats = useMemo(() => runCounts(filtered, 'mp_will_buy'), [filtered])
  const mpHowKnowStats = useMemo(() => runCounts(filtered.filter(r => /알고/.test(r.mp_know)), 'mp_how_know'), [filtered])
  const mpPathConversionRows = useMemo(() => {
    const aware = filtered.filter(r => /알고/.test(r.mp_know) && r.mp_how_know)
    const buckets = {}
    aware.forEach(r => {
      const path = r.mp_how_know.trim()
      if (!path) return
      if (!buckets[path]) buckets[path] = { total: 0, conv: 0 }
      buckets[path].total += 1
      if (/있다/.test(r.mp_bought) || /있다/.test(r.mp_will_buy)) buckets[path].conv += 1
    })
    return Object.entries(buckets)
      .map(([path, v]) => ({
        path,
        total: v.total,
        conv: v.conv,
        rate: v.total > 0 ? Math.round((v.conv / v.total) * 100) : 0,
      }))
      .sort((a, b) => b.rate - a.rate || b.total - a.total)
  }, [filtered])
  /** 마이핑 인지 경로 — 응답 수 내림차순, 차트용 짧은 라벨 + 툴팁 전체 문구 */
  const mpHowKnowChartRows = useMemo(() => {
    return Object.entries(mpHowKnowStats)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({
        fullName: name,
        shortLabel: name.length > 36 ? `${name.slice(0, 36)}…` : name,
        count,
      }))
  }, [mpHowKnowStats])

  /**
   * 티니핑 소비: 「이름만 알고…」만 선택 vs 그 외 하나라도 있음 (상호배타, 응답자 1인 1카운트).
   * 마이핑 구매·의향 = mp_bought 또는 mp_will_buy 에 있다 포함.
   */
  const tpConsumeMpPositiveRows = useMemo(() => {
    const mpPositive = r => /있다/.test(r.mp_bought) || /있다/.test(r.mp_will_buy)
    let nameOnlyN = 0
    let nameOnlyPos = 0
    let restN = 0
    let restPos = 0
    filtered.forEach(r => {
      const labels = tpConsumeFragments(r.tp_consume)
      if (labels.length === 0) return
      const hasOther = labels.some(l => l !== TP_CONSUME_NAME_ONLY)
      if (hasOther) {
        restN += 1
        if (mpPositive(r)) restPos += 1
      } else {
        nameOnlyN += 1
        if (mpPositive(r)) nameOnlyPos += 1
      }
    })
    const row = (key, label, total, pos) => ({
      key,
      label,
      total,
      pos,
      pct: total > 0 ? Math.round((pos / total) * 100) : 0,
    })
    return [
      row('nameOnly', '이름만 알고 (별도 소비 경험 없음)', nameOnlyN, nameOnlyPos),
      row('rest', '소비 경험 있음 (굿즈·콘텐츠·팝업 등)', restN, restPos),
    ]
  }, [filtered])

  // S2/S3: Decision/Behavior 그룹
  const posGroup = useMemo(() => {
    return filtered
  }, [filtered])
  const behaviorCompareBase = useMemo(
    () => filteredNoSeg.filter(r => ['A1', 'A2', 'B1', 'B2'].includes(r.segment)),
    [filteredNoSeg]
  )
  const behaviorUnknownCount = useMemo(
    () => filteredNoSeg.filter(r => !['A1', 'A2', 'B1', 'B2'].includes(r.segment)).length,
    [filteredNoSeg]
  )
  const behaviorPosGroup = useMemo(
    () => behaviorCompareBase.filter(r => r.segment === 'A1' || r.segment === 'B1'),
    [behaviorCompareBase]
  )
  const behaviorNegGroup = useMemo(
    () => behaviorCompareBase.filter(r => r.segment === 'A2' || r.segment === 'B2'),
    [behaviorCompareBase]
  )
  const decisionPosGroup = useMemo(
    () => filtered.filter(r => r.segment === 'A1' || r.segment === 'B1'),
    [filtered]
  )
  const decisionNegGroup = useMemo(
    () => filtered.filter(r => r.segment === 'A2' || r.segment === 'B2'),
    [filtered]
  )
  const buyReasonsPrimary = useMemo(() => {
    const reasons = {}
    decisionPosGroup.forEach(r => {
      const reason = r.mp_buy_reason || r.mp_will_buy_reason || ''
      if (!reason) return
      reasons[reason] = (reasons[reason] || 0) + 1
    })
    return reasons
  }, [decisionPosGroup])
  const buyReasonsRepurchase = useMemo(
    () => runCounts(decisionPosGroup.filter(r => r.mp_will_yes_reason_followup_raw), 'mp_will_yes_reason_followup_raw'),
    [decisionPosGroup]
  )
  const buyerReasonRows = useMemo(() => toDonutRows(buyReasonsPrimary, 5), [buyReasonsPrimary])
  const repurchaseReasonRows = useMemo(() => toDonutRows(buyReasonsRepurchase, 5), [buyReasonsRepurchase])
  const buyReasonDen = useMemo(() => decisionPosGroup.length, [decisionPosGroup])
  const repurchaseReasonDen = useMemo(() => decisionPosGroup.filter(r => r.mp_will_yes_reason_followup_raw).length, [decisionPosGroup])
  const posCharInterestLikertCounts = useMemo(() => {
    const counts = {}
    CHAR_LIKERT_ORDER.forEach(k => {
      counts[k] = 0
    })
    posGroup.forEach(r => {
      const level = matchCharLikertLevel(r.char_interest)
      if (level) counts[level] += 1
    })
    return counts
  }, [posGroup])
  const posCharInterestLikertDen = useMemo(
    () => Object.values(posCharInterestLikertCounts).reduce((a, b) => a + b, 0),
    [posCharInterestLikertCounts]
  )
  const posCharReasonHeatmap = useMemo(() => {
    const reasonCounts = runCounts(posGroup.filter(r => r.char_interest_reason), 'char_interest_reason')
    const topReasons = Object.entries(reasonCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([reason]) => reason)

    const heatmapRows = ['전체', '보통', '약간 관심 있음', '매우 관심 있음']
    const rows = heatmapRows.map(rowLabel => {
      const rowMembers = posGroup.filter(r => {
        if (!r.char_interest_reason) return false
        if (rowLabel === '전체') return true
        return matchCharLikertLevel(r.char_interest) === rowLabel
      })
      const n = rowMembers.length
      const counts = {}
      topReasons.forEach(reason => {
        counts[reason] = rowMembers.filter(r => r.char_interest_reason === reason).length
      })
      return { label: rowLabel, n, counts }
    })
    return { topReasons, rows }
  }, [posGroup])
  const posCommUsed = useMemo(() => posGroup.filter(r => /있다/.test(r.comm_used)).length, [posGroup])
  const posCommFeature = useMemo(() => runCounts(posGroup.filter(r => r.comm_feature), 'comm_feature'), [posGroup])
  const posCommFeatureDen = useMemo(() => posGroup.filter(r => r.comm_feature).length, [posGroup])
  const posCommFeatureRows = useMemo(() => toDonutRows(posCommFeature, 5), [posCommFeature])
  const posCommFeatureEtcRows = useMemo(
    () => Object.entries(posCommFeature).sort((a, b) => b[1] - a[1]).slice(5),
    [posCommFeature]
  )
  const posCommReasonCounts = useMemo(
    () => runCounts(posGroup.filter(r => r.comm_feature_reason), 'comm_feature_reason'),
    [posGroup]
  )
  const posCommReasonEtcRows = useMemo(
    () => Object.entries(posCommReasonCounts).sort((a, b) => b[1] - a[1]).slice(6),
    [posCommReasonCounts]
  )
  const posCommFeatureReasonHeatmap = useMemo(() => {
    const sortedReasons = Object.entries(posCommReasonCounts).sort((a, b) => b[1] - a[1])
    const topReasons = sortedReasons.slice(0, 6).map(([reason]) => reason)
    const topFeatures = Object.entries(posCommFeature)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([feature]) => feature)
    const overallDen = posCommFeatureDen
    const rows = ['전체', ...topFeatures].map(rowLabel => {
      const rowMembers = posGroup.filter(r => {
        if (!r.comm_feature_reason) return false
        if (rowLabel === '전체') return true
        return r.comm_feature === rowLabel
      })
      const n = rowMembers.length
      const counts = {}
      topReasons.forEach(reason => {
        counts[reason] = rowMembers.filter(r => r.comm_feature_reason === reason).length
      })
      const etcCount =
        topReasons.length < sortedReasons.length
          ? rowMembers.filter(r => !topReasons.includes(r.comm_feature_reason)).length
          : 0
      return { label: rowLabel, n, counts, etcCount }
    })
    const hasEtc = topReasons.length < sortedReasons.length
    let maxPct = 0
    rows.forEach(row => {
      topReasons.forEach(reason => {
        const v = row.counts[reason] || 0
        const pct = overallDen > 0 ? (v / overallDen) * 100 : 0
        if (pct > maxPct) maxPct = pct
      })
      if (hasEtc) {
        const etcPct = overallDen > 0 ? (row.etcCount / overallDen) * 100 : 0
        if (etcPct > maxPct) maxPct = etcPct
      }
    })
    return { topReasons, rows, hasEtc, maxPct: maxPct || 1, overallDen }
  }, [posGroup, posCommReasonCounts, posCommFeature, posCommFeatureDen])
  const posCharInterestFeatureHeatmap = useMemo(() => {
    const overallDen = posCommFeatureDen
    const sortedFeatures = Object.entries(posCommFeature).sort((a, b) => b[1] - a[1])
    const topFeatures = sortedFeatures.slice(0, 5).map(([feature]) => feature)
    const hasEtc = topFeatures.length < sortedFeatures.length
    const rows = ['전체', '보통', '약간 관심 있음', '매우 관심 있음'].map(rowLabel => {
      const rowMembers = posGroup.filter(r => {
        if (!r.comm_feature) return false
        if (rowLabel === '전체') return true
        return matchCharLikertLevel(r.char_interest) === rowLabel
      })
      const n = rowMembers.length
      const counts = {}
      topFeatures.forEach(feature => {
        counts[feature] = rowMembers.filter(r => r.comm_feature === feature).length
      })
      const etcCount =
        hasEtc ? rowMembers.filter(r => !topFeatures.includes(r.comm_feature)).length : 0
      return { label: rowLabel, n, counts, etcCount }
    })
    let maxPct = 0
    rows.forEach(row => {
      topFeatures.forEach(feature => {
        const v = row.counts[feature] || 0
        const pct = overallDen > 0 ? (v / overallDen) * 100 : 0
        if (pct > maxPct) maxPct = pct
      })
      if (hasEtc) {
        const etcPct = overallDen > 0 ? (row.etcCount / overallDen) * 100 : 0
        if (etcPct > maxPct) maxPct = etcPct
      }
    })
    return { topFeatures, rows, hasEtc, maxPct: maxPct || 1, overallDen }
  }, [posGroup, posCommFeature, posCommFeatureDen])
  const behaviorPosLikertCounts = useMemo(() => {
    const counts = {}
    CHAR_LIKERT_ORDER.forEach(k => {
      counts[k] = 0
    })
    behaviorPosGroup.forEach(r => {
      const level = matchCharLikertLevel(r.char_interest)
      if (level) counts[level] += 1
    })
    return counts
  }, [behaviorPosGroup])
  const behaviorPosLikertDen = useMemo(
    () => Object.values(behaviorPosLikertCounts).reduce((a, b) => a + b, 0),
    [behaviorPosLikertCounts]
  )
  const behaviorPosCommUsed = useMemo(
    () => behaviorPosGroup.filter(r => /있다/.test(r.comm_used)).length,
    [behaviorPosGroup]
  )
  const behaviorPosCommFeature = useMemo(
    () => runCounts(behaviorPosGroup.filter(r => r.comm_feature), 'comm_feature'),
    [behaviorPosGroup]
  )
  const behaviorPosCommFeatureDen = useMemo(
    () => behaviorPosGroup.filter(r => r.comm_feature).length,
    [behaviorPosGroup]
  )
  const behaviorPosCommFeatureRows = useMemo(
    () => toDonutRows(behaviorPosCommFeature, 5),
    [behaviorPosCommFeature]
  )
  const behaviorNegLikertCounts = useMemo(() => {
    const counts = {}
    CHAR_LIKERT_ORDER.forEach(k => {
      counts[k] = 0
    })
    behaviorNegGroup.forEach(r => {
      const level = matchCharLikertLevel(r.char_interest)
      if (level) counts[level] += 1
    })
    return counts
  }, [behaviorNegGroup])
  const behaviorNegLikertDen = useMemo(
    () => Object.values(behaviorNegLikertCounts).reduce((a, b) => a + b, 0),
    [behaviorNegLikertCounts]
  )
  const behaviorNegCommUsed = useMemo(
    () => behaviorNegGroup.filter(r => /있다/.test(r.comm_used)).length,
    [behaviorNegGroup]
  )
  const behaviorNegCommFeature = useMemo(
    () => runCounts(behaviorNegGroup.filter(r => r.comm_feature), 'comm_feature'),
    [behaviorNegGroup]
  )
  const behaviorNegCommFeatureDen = useMemo(
    () => behaviorNegGroup.filter(r => r.comm_feature).length,
    [behaviorNegGroup]
  )
  const behaviorNegCommFeatureRows = useMemo(
    () => toDonutRows(behaviorNegCommFeature, 5),
    [behaviorNegCommFeature]
  )

  // Decision negative group: A2 + B2
  const noGroup = useMemo(() => decisionNegGroup, [decisionNegGroup])
  const noReasonDen = useMemo(() => noGroup.length, [noGroup])
  const noReasons = useMemo(() => runCounts(noGroup.filter(r => r.mp_no_buy_reason), 'mp_no_buy_reason'), [noGroup])
  const noReasonRows = useMemo(() => toDonutRows(noReasons, 5), [noReasons])
  const noReasonEtcRows = useMemo(
    () => Object.entries(noReasons).sort((a, b) => b[1] - a[1]).slice(5),
    [noReasons]
  )

  // S4: Demographics by Gender/Age
  const genderBought = useMemo(() => ['여성','남성'].map(g => filtered.filter(r => r.gender===g && /있다/.test(r.mp_bought)).length), [filtered])
  const genderWill = useMemo(() => ['여성','남성'].map(g => filtered.filter(r => r.gender===g && !/있다/.test(r.mp_bought) && /있다/.test(r.mp_will_buy)).length), [filtered])
  const genderNo = useMemo(() => ['여성','남성'].map(g => filtered.filter(r => r.gender===g && /없다/.test(r.mp_will_buy) && !/있다/.test(r.mp_bought)).length), [filtered])

  const ageBought = useMemo(() => ageOptions.map(a => {
    const sub = filtered.filter(r => r.age === a)
    return sub.length ? Math.round(sub.filter(r => /있다/.test(r.mp_bought)).length / sub.length * 100) : 0
  }), [filtered, ageOptions])
  const ageWill = useMemo(() => ageOptions.map(a => {
    const sub = filtered.filter(r => r.age === a)
    return sub.length ? Math.round(sub.filter(r => !/있다/.test(r.mp_bought) && /있다/.test(r.mp_will_buy)).length / sub.length * 100) : 0
  }), [filtered, ageOptions])
  const ageNo = useMemo(() => ageOptions.map(a => {
    const sub = filtered.filter(r => r.age === a)
    return sub.length ? Math.round(sub.filter(r => /없다/.test(r.mp_will_buy) && !/있다/.test(r.mp_bought)).length / sub.length * 100) : 0
  }), [filtered, ageOptions])

  const n = filtered.length
  const pn = posGroup.length

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: { x: { grid: { display: false } }, y: { grid: { color: '#f0efe8' } } }
  }

  return (
    <div>
      <header>
        <div>
          <h1>마이핑 설문 분석 대시보드</h1>
          <p>{rawData.length > 0 ? `Z세대의 캐릭터 콘텐츠 & 커뮤니티 이용 경험 — n=${rawData.length}` : '데이터 없음'}</p>
        </div>
        <span className="n-badge">{rawData.length > 0 ? `필터 n=${filtered.length}` : 'n=0'}</span>
      </header>

      <div className="load-area">
        <input ref={fileInputRef} type="file" accept=".xlsx,.xls" />
        <button onClick={loadData}>엑셀 데이터 로드</button>
        <span>{loadStatus}</span>
      </div>

      <div className="filter-bar">
        <label>연령대</label>
        <select value={filterAge} onChange={e => setFilterAge(e.target.value)}>
          <option value="all">전체</option>
          {ageOptions.map(age => <option key={age} value={age}>{age}</option>)}
        </select>
        <div className="filter-sep"></div>
        <label>성별</label>
        <select value={filterGender} onChange={e => setFilterGender(e.target.value)}>
          <option value="all">전체</option>
          <option value="여성">여성</option>
          <option value="남성">남성</option>
        </select>
        <div className="filter-sep"></div>
        <label>세그먼트</label>
        <select value={filterSeg} onChange={e => setFilterSeg(e.target.value)}>
          <option value="all">전체</option>
          <option value="A1">A1 — 인지o, 구매o</option>
          <option value="A2">A2 — 인지o, 구매x</option>
          <option value="B1">B1 — 인지x, 의향o</option>
          <option value="B2">B2 — 인지x, 의향x</option>
        </select>
      </div>

      <div className="main">
        {/* S0 Demographic */}
        <div className="section-title">S0. 응답자 Demographic</div>
        <div className="grid grid-2">
          <div className="card">
            <h3>연령대 × 성별 분포</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '12px' }}>
              {ageOptions.map(age => {
                const total = filtered.filter(r => r.age === age).length
                const female = filtered.filter(r => r.age === age && r.gender === '여성').length
                const male = filtered.filter(r => r.age === age && r.gender === '남성').length
                return (
                  <div key={age} style={{ background: '#f7f6f2', borderRadius: '6px', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <div style={{ fontSize: '11px', color: '#6b6b65' }}>{age}</div>
                    <div style={{ fontSize: '24px', fontWeight: '700', color: '#1a1a18' }}>{total}명</div>
                    <div style={{ fontSize: '11px', color: '#6b6b65' }}>여 {female} / 남 {male}</div>
                  </div>
                )
              })}
            </div>
            <div className="chart-wrap" style={{ height: '180px' }}>
              {ageOptions.length > 0 && (
                <Bar data={{
                  labels: ageOptions,
                  datasets: [
                    { label: '여성', data: ageOptions.map(age => filtered.filter(r => r.age === age && r.gender === '여성').length), backgroundColor: '#534AB7' },
                    { label: '남성', data: ageOptions.map(age => filtered.filter(r => r.age === age && r.gender === '남성').length), backgroundColor: '#1D9E75' }
                  ]
                }} options={{ ...chartOptions, plugins: { ...chartOptions.plugins, legend: { display: true, position: 'bottom' } } }} />
              )}
            </div>
          </div>
          <div className="card">
            <h3>세그먼트별 분포</h3>
            <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div className="chart-wrap" style={{ height: '220px', flex: '1 1 200px', minWidth: '200px', maxWidth: '300px' }}>
                {Object.values(segmentStats).reduce((a,b)=>a+b,0) > 0 && (
                  <Doughnut data={{
                    labels: ['A1 인지o 구매o', 'A2 인지o 구매x', 'B1 인지x 의향o', 'B2 인지x 의향x'],
                    datasets: [{
                      data: ['A1','A2','B1','B2'].map(k=>segmentStats[k]||0),
                      backgroundColor: ['#534AB7','#1D9E75','#EF9F27','#D85A30']
                    }]
                  }} options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { display: false },
                      tooltip: { enabled: true }
                    }
                  }} />
                )}
              </div>
              <div style={{ flex: '1 1 240px', minWidth: '240px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #e2e0d8', color: '#6b6b65' }}>
                      <th style={{ padding: '8px 6px', fontWeight: 600, textAlign: 'left' }}>세그먼트</th>
                      <th style={{ padding: '8px 6px', fontWeight: 600, textAlign: 'right' }}>인원</th>
                      <th style={{ padding: '8px 6px', fontWeight: 600, textAlign: 'right' }}>비율</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { id: 'A1', label: 'A1 인지o 구매o', color: '#534AB7' },
                      { id: 'A2', label: 'A2 인지o 구매x', color: '#1D9E75' },
                      { id: 'B1', label: 'B1 인지x 의향o', color: '#EF9F27' },
                      { id: 'B2', label: 'B2 인지x 의향x', color: '#D85A30' }
                    ].map(row => {
                      const cnt = segmentStats[row.id] || 0
                      const pct = n > 0 ? Math.round((cnt / n) * 100) : 0
                      return (
                        <tr key={row.id} style={{ borderBottom: '1px solid #f0efe8' }}>
                          <td style={{ padding: '8px 6px', verticalAlign: 'middle' }}>
                            <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '2px', background: row.color, marginRight: '8px', verticalAlign: 'middle' }} />
                            {row.label}
                          </td>
                          <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 600, color: '#1a1a18' }}>{cnt}명</td>
                          <td style={{ padding: '8px 6px', textAlign: 'right', color: '#6b6b65' }}>{pct}%</td>
                        </tr>
                      )
                    })}
                    {(segmentStats['N/A'] || 0) > 0 && (
                      <tr style={{ borderBottom: '1px solid #f0efe8' }}>
                        <td style={{ padding: '8px 6px', color: '#6b6b65' }}>N/A (분류 불가)</td>
                        <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 600 }}>{segmentStats['N/A']}명</td>
                        <td style={{ padding: '8px 6px', textAlign: 'right', color: '#6b6b65' }}>{n > 0 ? Math.round((segmentStats['N/A'] / n) * 100) : 0}%</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* S4 Gender/Age */}
        <div className="grid grid-2" style={{ marginTop: '16px' }}>
          <div className="card">
            <h3>성별 × 마이핑 구매/의향</h3>
            <div className="chart-wrap" style={{height:'220px'}}>
              <Bar data={{labels:['여성','남성'],datasets:[{label:'구매경험',data:genderBought,backgroundColor:'#534AB7'},{label:'구매의향있음',data:genderWill,backgroundColor:'#1D9E75'},{label:'구매의향없음',data:genderNo,backgroundColor:'#D85A30'}]}} options={{...chartOptions,scales:{...chartOptions.scales,x:{stacked:false,grid:{display:false}}}}} />
            </div>
          </div>
          <div className="card">
            <h3>연령대 × 마이핑 구매/의향</h3>
            <div className="chart-wrap" style={{height:'220px'}}>
              <Bar data={{labels:ageOptions,datasets:[{label:'구매경험',data:ageBought,backgroundColor:'#534AB7'},{label:'구매의향있음',data:ageWill,backgroundColor:'#1D9E75'},{label:'구매의향없음',data:ageNo,backgroundColor:'#D85A30'}]}} options={{...chartOptions,scales:{...chartOptions.scales,y:{max:100,ticks:{callback:v=>v+'%'},grid:{color:'#f0efe8'}}}}} />
            </div>
          </div>
        </div>

        {/* S1 Funnel */}
        <div className="section-title">S1. 마이핑 퍼널 분석</div>
        <div className="card">
          <h3>티니핑 인지 → 마이핑 인지 → 마이핑 구매 → 추가 구매 의향</h3>
          <div
            style={{
              display: 'flex',
              gap: '24px',
              alignItems: 'flex-start',
              flexWrap: 'wrap',
              marginTop: '8px',
            }}
          >
            <div style={{ flex: '1 1 300px', minWidth: 260 }}>
              <div style={{ fontSize: '12px' }}>
                {[
                  ['티니핑 인지', tpKnowCnt, n],
                  ['마이핑 인지', mpKnowCnt, n],
                  ['마이핑 구매', mpBoughtCnt, n],
                  ['마이핑 추가 구매 의향', mpRepurchaseCnt, n],
                ].map(([label, val, total], i) => {
                  const pct = total > 0 ? Math.round((val / total) * 100) : 0
                  const barColors = ['#534AB7', '#1D9E75', '#D85A30', '#EF9F27']
                  return (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '8px 0' }}>
                      <div style={{ minWidth: '130px', fontSize: '11px', color: '#6b6b65', textAlign: 'right' }}>{label}</div>
                      <div style={{ flex: 1, background: '#f0efe8', borderRadius: '4px', height: '24px', position: 'relative' }}>
                        <div
                          style={{
                            width: `${pct}%`,
                            height: '100%',
                            background: barColors[i],
                            borderRadius: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            paddingLeft: '8px',
                            color: '#fff',
                            fontSize: '11px',
                            fontWeight: '700',
                          }}
                        >
                          {pct}%
                        </div>
                      </div>
                      <div style={{ minWidth: '36px', fontSize: '11px', color: '#6b6b65' }}>{val}명</div>
                    </div>
                  )
                })}
              </div>
            </div>
            <div
              style={{
                flex: '0 1 320px',
                minWidth: 240,
                paddingLeft: '20px',
                borderLeft: '1px solid #e2e0d8',
                alignSelf: 'stretch',
              }}
            >
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#6b6b65', marginBottom: '10px' }}>
                단계별 이탈률
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {funnelDropoffs.map(row => (
                  <li
                    key={row.label}
                    style={{ fontSize: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap' }}
                  >
                    <span style={{ color: '#1a1a18', lineHeight: 1.4 }}>| {row.label} 이탈률</span>
                    <span style={{ fontWeight: 700, color: '#D85A30', flexShrink: 0 }}>
                      {row.rate !== null ? `${row.rate}%` : '—'}
                    </span>
                  </li>
                ))}
              </ul>
              <p style={{ fontSize: '10px', color: '#6b6b65', marginTop: '10px', lineHeight: 1.45, marginBottom: 0 }}>
                이탈률 = (이전 단계 인원 − 다음 단계 인원) ÷ 이전 단계 인원 (소수 첫째 자리 반올림)
              </p>
            </div>
          </div>
        </div>
        <div className="card" style={{ marginTop: '16px' }}>
          <h3>티니핑 소비 경험(이름만 vs 기타)별 마이핑 구매·의향 비중</h3>
          <p style={{ fontSize: '11px', color: '#6b6b65', marginTop: '6px', lineHeight: 1.5, marginBottom: '12px' }}>
            응답자 한 명은 한 그룹에만 포함됩니다. &quot;{TP_CONSUME_NAME_ONLY}&quot;만 고른 경우는 첫 번째 그룹, 굿즈·콘텐츠 등 다른 항목을 하나라도 고른 경우는 두 번째 그룹입니다. 마이핑 구매(있다) 또는 구매 의향(있다)이면 오른쪽 분자에 포함됩니다.
          </p>
          {tpConsumeMpPositiveRows.every(r => r.total === 0) ? (
            <div style={{ color: '#aaa', fontSize: '12px' }}>티니핑 소비 경험 응답이 없습니다.</div>
          ) : (
            <div
              style={{
                display: 'flex',
                gap: '28px',
                flexWrap: 'wrap',
                justifyContent: 'center',
                alignItems: 'flex-start',
              }}
            >
              {tpConsumeMpPositiveRows.map(row => (
                <div key={row.key} style={{ flex: '1 1 220px', maxWidth: 320 }}>
                  <div
                    style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#1a1a18',
                      textAlign: 'center',
                      lineHeight: 1.45,
                      marginBottom: 10,
                    }}
                  >
                    {row.label}
                  </div>
                  {row.total === 0 ? (
                    <div style={{ color: '#aaa', fontSize: '12px', textAlign: 'center', padding: '48px 0' }}>해당 그룹 응답 없음</div>
                  ) : (
                    <>
                      <div className="chart-wrap" style={{ height: 200, maxWidth: 280, margin: '0 auto' }}>
                        <Doughnut
                          data={{
                            labels: ['구매·의향 있음', '그 외'],
                            datasets: [
                              {
                                data: [row.pos, Math.max(0, row.total - row.pos)],
                                backgroundColor: ['#534AB7', '#d0cdc4'],
                                borderWidth: 0,
                              },
                            ],
                          }}
                          options={{
                            responsive: true,
                            maintainAspectRatio: false,
                            cutout: '56%',
                            plugins: {
                              legend: {
                                position: 'bottom',
                                labels: { font: { size: 10 }, boxWidth: 10, padding: 10 },
                              },
                              tooltip: {
                                callbacks: {
                                  label(ctx) {
                                    const v = ctx.raw
                                    const sum = row.total
                                    const p = sum ? Math.round((v / sum) * 100) : 0
                                    return ` ${ctx.label}: ${v}명 (${p}%)`
                                  },
                                },
                              },
                            },
                          }}
                        />
                      </div>
                      <div style={{ fontSize: '11px', color: '#6b6b65', textAlign: 'center', marginTop: 8 }}>
                        구매·의향 {row.pos}명 / 전체 {row.total}명 ({row.pct}%)
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="card" style={{ marginTop: '16px' }}>
          <h3>마이핑 인지 경로 (인지자 기준)</h3>
          <p style={{ fontSize: '11px', color: '#6b6b65', marginTop: '6px', marginBottom: '10px' }}>
            응답 수 많은 순 · 막대 길이 = 인지자 명수
          </p>
          {mpHowKnowChartRows.length === 0 ? (
            <div style={{ color: '#aaa', fontSize: '12px' }}>데이터 없음</div>
          ) : (
            <div
              className="chart-wrap"
              style={{ height: `${Math.max(200, mpHowKnowChartRows.length * 32 + 56)}px` }}
            >
              <Bar
                data={{
                  labels: mpHowKnowChartRows.map(r => r.shortLabel),
                  datasets: [
                    {
                      label: '인지자 수',
                      data: mpHowKnowChartRows.map(r => r.count),
                      backgroundColor: '#534AB7',
                      borderRadius: 4,
                    },
                  ],
                }}
                options={{
                  indexAxis: 'y',
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { display: false },
                    tooltip: {
                      callbacks: {
                        title: items =>
                          items[0] ? mpHowKnowChartRows[items[0].dataIndex].fullName : '',
                        label: item => ` ${item.parsed.x}명`,
                      },
                    },
                  },
                  scales: {
                    x: {
                      beginAtZero: true,
                      grid: { color: '#f0efe8' },
                      ticks: { precision: 0 },
                    },
                    y: {
                      grid: { display: false },
                      ticks: { font: { size: 11 } },
                    },
                  },
                }}
              />
            </div>
          )}
          <div style={{ marginTop: '12px' }}>
            <button
              type="button"
              onClick={() => setMpPathConvOpen(v => !v)}
              style={{
                fontSize: '11px',
                color: '#6b6b65',
                background: 'none',
                border: '1px solid #e2e0d8',
                borderRadius: '4px',
                padding: '3px 10px',
                cursor: 'pointer',
              }}
            >
              {mpPathConvOpen ? '경로별 전환율 닫기' : '경로별 구매/의향 전환율 보기'}
            </button>
            {mpPathConvOpen && (
              <div style={{ marginTop: '8px', border: '1px solid #f0efe8', borderRadius: '6px', padding: '8px 10px', background: '#fafaf7' }}>
                <div style={{ fontSize: '10px', color: '#6b6b65', marginBottom: '6px' }}>
                  인지자 기준, 전환=구매 경험 또는 구매의향(있다)
                </div>
                {mpPathConversionRows.length === 0 ? (
                  <div style={{ color: '#aaa', fontSize: '12px' }}>경로 데이터 없음</div>
                ) : (
                  mpPathConversionRows.map(row => (
                    <div
                      key={row.path}
                      style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '4px 0', fontSize: '11px', borderBottom: '1px solid #ece9df' }}
                    >
                      <div style={{ color: '#1a1a18' }}>{row.path}</div>
                      <div style={{ color: '#6b6b65', whiteSpace: 'nowrap' }}>
                        {row.conv}/{row.total}명 ({row.rate}%)
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* S2 Decision */}
        <div className="section-title">S2. Decision — 구매/비구매 이유</div>
        <p style={{ fontSize: '12px', color: '#6b6b65', maxWidth: '920px', lineHeight: 1.55, marginBottom: '12px' }}>
          아래 두 카드는 현재 필터 결과를 그대로 집계합니다. 세그먼트 필터(A1/A2/B1/B2)를 바꿔 같은 카드에서 이유 분포를 비교해볼 수 있습니다.
        </p>
        <div style={{ fontSize: '12px', fontWeight: 700, color: '#3730a3', marginBottom: '8px' }}>
          구매 경험이 있거나 구매 의향이 있는 집단 (A1 + B1)
        </div>
        <div className="grid grid-2">
          <div className="card">
            <h3>구매 이유</h3>
            <div style={{ fontSize: '10px', color: '#6b6b65', marginBottom: '6px' }}>분모 n={buyReasonDen}</div>
            {buyerReasonRows.length === 0 ? (
              <div style={{ color: '#aaa', fontSize: '12px' }}>데이터 없음</div>
            ) : (
              <>
                <div className="chart-wrap" style={{ height: '230px', maxWidth: '380px', margin: '0 auto' }}>
                  <Doughnut
                    data={{
                      labels: buyerReasonRows.map(r => r.label),
                      datasets: [{ data: buyerReasonRows.map(r => r.value), backgroundColor: buyerReasonRows.map(r => r.color) }],
                    }}
                    options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }}
                  />
                </div>
                <div style={{ marginTop: '8px' }}>
                  {buyerReasonRows.map(row => {
                    const pct = buyReasonDen > 0 ? Math.round((row.value / buyReasonDen) * 100) : 0
                    return (
                      <div
                        key={row.label}
                        style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '4px 0', fontSize: '11px' }}
                      >
                        <div style={{ color: '#1a1a18' }}>
                          <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '2px', background: row.color, marginRight: '6px' }} />
                          {row.label}
                        </div>
                        <div style={{ color: '#6b6b65', whiteSpace: 'nowrap' }}>{row.value}명 ({pct}%)</div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
          <div className="card">
            <h3>추가 구매 이유</h3>
            <div style={{ fontSize: '10px', color: '#6b6b65', marginBottom: '6px' }}>분모 n={repurchaseReasonDen}</div>
            {repurchaseReasonRows.length === 0 ? (
              <div style={{ color: '#aaa', fontSize: '12px' }}>해당 응답 없음</div>
            ) : (
              <>
                <div className="chart-wrap" style={{ height: '250px', maxWidth: '420px', margin: '0 auto' }}>
                  <Doughnut
                    data={{
                      labels: repurchaseReasonRows.map(r => r.label),
                      datasets: [{ data: repurchaseReasonRows.map(r => r.value), backgroundColor: repurchaseReasonRows.map(r => r.color) }],
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: { display: false },
                      },
                    }}
                  />
                </div>
                <div style={{ marginTop: '8px' }}>
                  {repurchaseReasonRows.map(row => {
                    const pct = repurchaseReasonDen > 0 ? Math.round((row.value / repurchaseReasonDen) * 100) : 0
                    return (
                      <div
                        key={row.label}
                        style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '4px 0', fontSize: '11px' }}
                      >
                        <div style={{ color: '#1a1a18' }}>
                          <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '2px', background: row.color, marginRight: '6px' }} />
                          {row.label}
                        </div>
                        <div style={{ color: '#6b6b65', whiteSpace: 'nowrap' }}>{row.value}명 ({pct}%)</div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </div>
        <div style={{ fontSize: '12px', fontWeight: 700, color: '#92400e', marginTop: '16px', marginBottom: '8px' }}>
          구매 의향이 없는 집단 (A2 + B2)
        </div>
        <div className="card" style={{ marginTop: '16px' }}>
          <h3>구매 의향 없는 이유</h3>
          <div style={{ fontSize: '11px', color: '#6b6b65', marginTop: '4px', marginBottom: '6px' }}>
            분모 n={noReasonDen}
          </div>
          {noReasonRows.length === 0 ? (
            <div style={{ color: '#aaa', fontSize: '12px', marginTop: '8px' }}>데이터 없음</div>
          ) : (
            <div style={{ display: 'flex', gap: '22px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div className="chart-wrap" style={{ height: '230px', width: '320px', minWidth: '260px' }}>
                <Doughnut
                  data={{
                    labels: noReasonRows.map(r => r.label),
                    datasets: [{ data: noReasonRows.map(r => r.value), backgroundColor: noReasonRows.map(r => r.color) }],
                  }}
                  options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }}
                />
              </div>
              <div style={{ flex: '1 1 300px', minWidth: '260px' }}>
                {noReasonRows.map(row => {
                  const pct = noReasonDen > 0 ? Math.round((row.value / noReasonDen) * 100) : 0
                  return (
                    <div
                      key={row.label}
                      style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '6px 0', fontSize: '11px', borderBottom: '1px solid #f0efe8' }}
                    >
                      <div style={{ color: '#1a1a18' }}>
                        <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '2px', background: row.color, marginRight: '6px' }} />
                        {row.label}
                      </div>
                      <div style={{ color: '#6b6b65', whiteSpace: 'nowrap' }}>{row.value}명 ({pct}%)</div>
                    </div>
                  )
                })}
                {noReasonEtcRows.length > 0 && (
                  <div style={{ marginTop: '8px' }}>
                    <button
                      type="button"
                      onClick={() => setNoReasonEtcOpen(v => !v)}
                      style={{
                        fontSize: '11px',
                        color: '#6b6b65',
                        background: 'none',
                        border: '1px solid #e2e0d8',
                        borderRadius: '4px',
                        padding: '3px 10px',
                        cursor: 'pointer',
                      }}
                    >
                      {noReasonEtcOpen ? '기타 상세 닫기' : `기타 상세 보기 (${noReasonEtcRows.length}개)`}
                    </button>
                    {noReasonEtcOpen && (
                      <div style={{ marginTop: '8px', border: '1px solid #f0efe8', borderRadius: '6px', padding: '8px 10px', background: '#fafaf7' }}>
                        {noReasonEtcRows.map(([label, count]) => {
                          const pct = noReasonDen > 0 ? Math.round((count / noReasonDen) * 100) : 0
                          return (
                            <div
                              key={label}
                              style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '4px 0', fontSize: '11px' }}
                            >
                              <div style={{ color: '#1a1a18' }}>{label}</div>
                              <div style={{ color: '#6b6b65', whiteSpace: 'nowrap' }}>{count}명 ({pct}%)</div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="section-title">S3. Behavior — 캐릭터 IP × 커뮤니티 패턴</div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '16px', marginBottom: '8px' }}>
          {[
            { id: 'all', label: '전체' },
            { id: 'compare', label: '세그먼트 비교 (A1+B1 vs A2+B2)' },
          ].map(opt => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setBehaviorMode(opt.id)}
              style={{
                fontSize: '11px',
                border: behaviorMode === opt.id ? '1px solid #534AB7' : '1px solid #e2e0d8',
                background: behaviorMode === opt.id ? '#eeedf8' : '#fff',
                color: behaviorMode === opt.id ? '#3730a3' : '#6b6b65',
                borderRadius: '999px',
                padding: '4px 10px',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div style={{ fontSize: '10px', color: '#6b6b65', marginBottom: '4px' }}>
          {behaviorMode === 'all'
            ? '현재 전역 필터(세그먼트 포함) 기준으로 패턴을 보여줍니다.'
            : `세그먼트 비교 모드: 연령/성별 필터만 반영, A1+B1 vs A2+B2 고정 비교 (비교 모수 n=${behaviorCompareBase.length}, N/A 제외 ${behaviorUnknownCount}명)`}
        </div>
        {behaviorMode === 'all' && (
        <>
        <div className="card" style={{ marginTop: '16px' }}>
          <h3>캐릭터 IP 관심도 (리커트) + 관심 이유 히트맵</h3>
          <div style={{ fontSize: '11px', color: '#6b6b65', marginTop: '4px', marginBottom: '8px' }}>
            관심도 분모 n={posCharInterestLikertDen}, 히트맵은 상위 이유 기준이며 &quot;전체&quot; 행을 포함합니다.
          </div>
          {posCharInterestLikertDen > 0 ? (
            <div style={{ marginBottom: '14px' }}>
              <div style={{ display: 'flex', width: '100%', height: '24px', borderRadius: '6px', overflow: 'hidden', background: '#f0efe8' }}>
                {CHAR_LIKERT_ORDER.map(level => {
                  const c = posCharInterestLikertCounts[level] || 0
                  const pct = Math.round((c / posCharInterestLikertDen) * 100)
                  return (
                    <div
                      key={level}
                      style={{
                        width: `${pct}%`,
                        background: CHAR_LIKERT_COLORS[level],
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                        fontSize: '10px',
                        fontWeight: 700,
                        minWidth: pct > 7 ? 'auto' : 0,
                      }}
                      title={`${level}: ${c}명 (${pct}%)`}
                    >
                      {pct >= 12 ? `${pct}%` : ''}
                    </div>
                  )
                })}
              </div>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '8px' }}>
                {CHAR_LIKERT_ORDER.map(level => {
                  const c = posCharInterestLikertCounts[level] || 0
                  return (
                    <div key={level} style={{ fontSize: '11px', color: '#1a1a18' }}>
                      <span style={{ display: 'inline-block', width: '9px', height: '9px', borderRadius: '2px', background: CHAR_LIKERT_COLORS[level], marginRight: '6px' }} />
                      {level} ({c}명)
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div style={{ color: '#aaa', fontSize: '12px', marginBottom: '12px' }}>관심도 응답 없음</div>
          )}
          {posCharReasonHeatmap.topReasons.length === 0 ? (
            <div style={{ color: '#aaa', fontSize: '12px' }}>관심 이유 응답 없음</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', minWidth: '760px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e2e0d8' }}>
                    <th style={{ textAlign: 'left', padding: '8px 6px', color: '#6b6b65', width: '170px' }}>관심도</th>
                    <th style={{ textAlign: 'right', padding: '8px 6px', color: '#6b6b65', width: '66px' }}>n</th>
                    {posCharReasonHeatmap.topReasons.map(reason => (
                      <th key={reason} style={{ textAlign: 'left', padding: '8px 6px', color: '#6b6b65' }}>
                        {reason.length > 18 ? `${reason.slice(0, 18)}…` : reason}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {posCharReasonHeatmap.rows.map(row => (
                    <tr key={row.label} style={{ borderBottom: '1px solid #f0efe8' }}>
                      <td style={{ padding: '8px 6px', color: '#1a1a18', fontWeight: row.label === '전체' ? 700 : 500 }}>{row.label}</td>
                      <td style={{ padding: '8px 6px', textAlign: 'right', color: '#6b6b65' }}>{row.n}</td>
                      {posCharReasonHeatmap.topReasons.map(reason => {
                        const v = row.counts[reason] || 0
                        const pct = row.n > 0 ? Math.round((v / row.n) * 100) : 0
                        const alpha = Math.min(0.88, Math.max(0.06, pct / 100))
                        return (
                          <td key={reason} style={{ padding: '6px' }}>
                            <div
                              style={{
                                background: `rgba(83,74,183,${alpha})`,
                                borderRadius: '4px',
                                minHeight: '28px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                color: pct >= 35 ? '#fff' : '#1a1a18',
                                padding: '4px 6px',
                                fontWeight: 600,
                              }}
                              title={`${row.label} | ${reason}: ${v}명 (${pct}%)`}
                            >
                              <span>{v}</span>
                              <span>{pct}%</span>
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="card" style={{ marginTop: '16px' }}>
          <h3>커뮤니티 이용률 & 선호 기능</h3>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }}>
            <div style={{ background: '#fff4ef', border: '1px solid #f4d6c8', borderRadius: '8px', padding: '10px 12px', minWidth: '180px' }}>
              <div style={{ fontSize: '11px', color: '#6b6b65' }}>이용률 (구매·의향 그룹 기준)</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: '#D85A30', lineHeight: 1.2 }}>
                {pn > 0 ? Math.round((posCommUsed / pn) * 100) : 0}%
              </div>
              <div style={{ fontSize: '11px', color: '#6b6b65' }}>{posCommUsed}/{pn}명</div>
            </div>
          </div>

          <div style={{ marginTop: '6px', marginBottom: '16px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#1a1a18', marginBottom: '6px' }}>자주 쓰는 기능 (파이 + 리스트)</div>
            {posCommFeatureRows.length === 0 ? (
              <div style={{ color: '#aaa', fontSize: '12px' }}>기능 응답 없음</div>
            ) : (
              <div style={{ display: 'flex', gap: '22px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div className="chart-wrap" style={{ height: '230px', width: '320px', minWidth: '260px' }}>
                  <Doughnut
                    data={{
                      labels: posCommFeatureRows.map(r => r.label),
                      datasets: [{ data: posCommFeatureRows.map(r => r.value), backgroundColor: posCommFeatureRows.map(r => r.color) }],
                    }}
                    options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }}
                  />
                </div>
                <div style={{ flex: '1 1 300px', minWidth: '260px' }}>
                  {posCommFeatureRows.map(row => {
                    const pct = posCommFeatureDen > 0 ? Math.round((row.value / posCommFeatureDen) * 100) : 0
                    return (
                      <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '6px 0', fontSize: '11px', borderBottom: '1px solid #f0efe8' }}>
                        <div style={{ color: '#1a1a18' }}>
                          <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '2px', background: row.color, marginRight: '6px' }} />
                          {row.label}
                        </div>
                        <div style={{ color: '#6b6b65', whiteSpace: 'nowrap' }}>{row.value}명 ({pct}%)</div>
                      </div>
                    )
                  })}
                  {posCommFeatureEtcRows.length > 0 && (
                    <div style={{ marginTop: '8px' }}>
                      <button
                        type="button"
                        onClick={() => setPosCommFeatureEtcOpen(v => !v)}
                        style={{ fontSize: '11px', color: '#6b6b65', background: 'none', border: '1px solid #e2e0d8', borderRadius: '4px', padding: '3px 10px', cursor: 'pointer' }}
                      >
                        {posCommFeatureEtcOpen ? '기타 상세 닫기' : `기타 상세 보기 (${posCommFeatureEtcRows.length}개)`}
                      </button>
                      {posCommFeatureEtcOpen && (
                        <div style={{ marginTop: '8px', border: '1px solid #f0efe8', borderRadius: '6px', padding: '8px 10px', background: '#fafaf7' }}>
                          {posCommFeatureEtcRows.map(([label, count]) => {
                            const pct = posCommFeatureDen > 0 ? Math.round((count / posCommFeatureDen) * 100) : 0
                            return (
                              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '4px 0', fontSize: '11px' }}>
                                <div style={{ color: '#1a1a18' }}>{label}</div>
                                <div style={{ color: '#6b6b65', whiteSpace: 'nowrap' }}>{count}명 ({pct}%)</div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div style={{ marginTop: '6px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#1a1a18', marginBottom: '6px' }}>자주 쓰는 기능 × 이유 (히트맵)</div>
            <div style={{ fontSize: '10px', color: '#6b6b65', marginBottom: '6px' }}>
              모든 셀의 비율은 전체 기능 응답자 n={posCommFeatureReasonHeatmap.overallDen} 기준입니다.
            </div>
            {posCommFeatureReasonHeatmap.topReasons.length === 0 ? (
              <div style={{ color: '#aaa', fontSize: '12px' }}>기능 이유 응답 없음</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', minWidth: '760px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #e2e0d8' }}>
                      <th style={{ textAlign: 'left', padding: '8px 6px', color: '#6b6b65', width: '170px' }}>기능</th>
                      <th style={{ textAlign: 'right', padding: '8px 6px', color: '#6b6b65', width: '66px' }}>n</th>
                      {posCommFeatureReasonHeatmap.topReasons.map(reason => (
                        <th key={reason} style={{ textAlign: 'left', padding: '8px 6px', color: '#6b6b65' }}>
                          {reason.length > 18 ? `${reason.slice(0, 18)}…` : reason}
                        </th>
                      ))}
                      {posCommFeatureReasonHeatmap.hasEtc && <th style={{ textAlign: 'left', padding: '8px 6px', color: '#6b6b65' }}>기타</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {posCommFeatureReasonHeatmap.rows.map(row => (
                      <tr key={row.label} style={{ borderBottom: '1px solid #f0efe8' }}>
                        <td style={{ padding: '8px 6px', color: '#1a1a18', fontWeight: row.label === '전체' ? 700 : 500 }}>{row.label}</td>
                        <td style={{ padding: '8px 6px', textAlign: 'right', color: '#6b6b65' }}>{row.n}</td>
                        {posCommFeatureReasonHeatmap.topReasons.map(reason => {
                          const v = row.counts[reason] || 0
                          const pct =
                            posCommFeatureReasonHeatmap.overallDen > 0
                              ? Math.round((v / posCommFeatureReasonHeatmap.overallDen) * 100)
                              : 0
                          const scaled = pct / posCommFeatureReasonHeatmap.maxPct
                          const alpha = Math.min(0.88, Math.max(0.06, scaled * 0.88))
                          return (
                            <td key={reason} style={{ padding: '6px' }}>
                              <div style={{ background: `rgba(216,90,48,${alpha})`, borderRadius: '4px', minHeight: '28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: scaled >= 0.55 ? '#fff' : '#1a1a18', padding: '4px 6px', fontWeight: 600 }}>
                                <span>{v}</span>
                                <span>{pct}%</span>
                              </div>
                            </td>
                          )
                        })}
                        {posCommFeatureReasonHeatmap.hasEtc && (
                          <td style={{ padding: '6px' }}>
                            <div
                              style={{
                                background: `rgba(216,90,48,${Math.min(
                                  0.88,
                                  Math.max(
                                    0.06,
                                    ((posCommFeatureReasonHeatmap.overallDen > 0
                                      ? Math.round((row.etcCount / posCommFeatureReasonHeatmap.overallDen) * 100)
                                      : 0) /
                                      posCommFeatureReasonHeatmap.maxPct) * 0.88
                                  )
                                )})`,
                                borderRadius: '4px',
                                minHeight: '28px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                color:
                                  ((posCommFeatureReasonHeatmap.overallDen > 0
                                    ? Math.round((row.etcCount / posCommFeatureReasonHeatmap.overallDen) * 100)
                                    : 0) /
                                    posCommFeatureReasonHeatmap.maxPct) >= 0.55
                                    ? '#fff'
                                    : '#1a1a18',
                                padding: '4px 6px',
                                fontWeight: 600,
                              }}
                            >
                              <span>{row.etcCount}</span>
                              <span>
                                {posCommFeatureReasonHeatmap.overallDen > 0
                                  ? Math.round((row.etcCount / posCommFeatureReasonHeatmap.overallDen) * 100)
                                  : 0}
                                %
                              </span>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {posCommReasonEtcRows.length > 0 && (
              <div style={{ marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setPosCommReasonEtcOpen(v => !v)}
                  style={{ fontSize: '11px', color: '#6b6b65', background: 'none', border: '1px solid #e2e0d8', borderRadius: '4px', padding: '3px 10px', cursor: 'pointer' }}
                >
                  {posCommReasonEtcOpen ? '이유 기타 상세 닫기' : `이유 기타 상세 보기 (${posCommReasonEtcRows.length}개)`}
                </button>
                {posCommReasonEtcOpen && (
                  <div style={{ marginTop: '8px', border: '1px solid #f0efe8', borderRadius: '6px', padding: '8px 10px', background: '#fafaf7' }}>
                    {posCommReasonEtcRows.map(([label, count]) => (
                      <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '4px 0', fontSize: '11px' }}>
                        <div style={{ color: '#1a1a18' }}>{label}</div>
                        <div style={{ color: '#6b6b65', whiteSpace: 'nowrap' }}>{count}명</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        </>
        )}
        {behaviorMode === 'compare' && (
          <div className="grid grid-2" style={{ marginTop: '16px' }}>
            <div className="card">
              <h3>A1+B1 (구매/의향 있음) 패턴 (N={behaviorPosGroup.length})</h3>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#D85A30', marginBottom: '10px' }}>
                커뮤니티 이용률 {behaviorPosGroup.length > 0 ? Math.round((behaviorPosCommUsed / behaviorPosGroup.length) * 100) : 0}% ({behaviorPosCommUsed}/{behaviorPosGroup.length}명)
              </div>
              {behaviorPosLikertDen > 0 && (
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#1a1a18', marginBottom: '6px' }}>캐릭터 IP 관심도 (리커트)</div>
                  <div style={{ display: 'flex', width: '100%', height: '22px', borderRadius: '6px', overflow: 'hidden', background: '#f0efe8' }}>
                    {CHAR_LIKERT_ORDER.map(level => {
                      const c = behaviorPosLikertCounts[level] || 0
                      const pct = Math.round((c / behaviorPosLikertDen) * 100)
                      return <div key={level} style={{ width: `${pct}%`, background: CHAR_LIKERT_COLORS[level] }} title={`${level}: ${c}명 (${pct}%)`} />
                    })}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
                    {CHAR_LIKERT_ORDER.map(level => (
                      <div key={level} style={{ fontSize: '10px', color: '#1a1a18' }}>
                        <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '2px', background: CHAR_LIKERT_COLORS[level], marginRight: '5px' }} />
                        {level} ({behaviorPosLikertCounts[level] || 0}명)
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {behaviorPosCommFeatureRows.length > 0 && (
                <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div style={{ width: '100%', fontSize: '12px', fontWeight: 600, color: '#1a1a18' }}>자주 쓰는 기능</div>
                  <div className="chart-wrap" style={{ height: '210px', width: '260px', minWidth: '220px' }}>
                    <Doughnut
                      data={{ labels: behaviorPosCommFeatureRows.map(r => r.label), datasets: [{ data: behaviorPosCommFeatureRows.map(r => r.value), backgroundColor: behaviorPosCommFeatureRows.map(r => r.color) }] }}
                      options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }}
                    />
                  </div>
                  <div style={{ flex: '1 1 220px', minWidth: '220px' }}>
                    {behaviorPosCommFeatureRows.map(row => {
                      const pct = behaviorPosCommFeatureDen > 0 ? Math.round((row.value / behaviorPosCommFeatureDen) * 100) : 0
                      return <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '6px 0', fontSize: '11px', borderBottom: '1px solid #f0efe8' }}><div>{row.label}</div><div style={{ whiteSpace: 'nowrap', color: '#6b6b65' }}>{row.value}명 ({pct}%)</div></div>
                    })}
                  </div>
                </div>
              )}
            </div>
            <div className="card">
              <h3>A2+B2 (구매/의향 없음) 패턴 (N={behaviorNegGroup.length})</h3>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#D85A30', marginBottom: '10px' }}>
                커뮤니티 이용률 {behaviorNegGroup.length > 0 ? Math.round((behaviorNegCommUsed / behaviorNegGroup.length) * 100) : 0}% ({behaviorNegCommUsed}/{behaviorNegGroup.length}명)
              </div>
              {behaviorNegLikertDen > 0 && (
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#1a1a18', marginBottom: '6px' }}>캐릭터 IP 관심도 (리커트)</div>
                  <div style={{ display: 'flex', width: '100%', height: '22px', borderRadius: '6px', overflow: 'hidden', background: '#f0efe8' }}>
                    {CHAR_LIKERT_ORDER.map(level => {
                      const c = behaviorNegLikertCounts[level] || 0
                      const pct = Math.round((c / behaviorNegLikertDen) * 100)
                      return <div key={level} style={{ width: `${pct}%`, background: CHAR_LIKERT_COLORS[level] }} title={`${level}: ${c}명 (${pct}%)`} />
                    })}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
                    {CHAR_LIKERT_ORDER.map(level => (
                      <div key={level} style={{ fontSize: '10px', color: '#1a1a18' }}>
                        <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '2px', background: CHAR_LIKERT_COLORS[level], marginRight: '5px' }} />
                        {level} ({behaviorNegLikertCounts[level] || 0}명)
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {behaviorNegCommFeatureRows.length > 0 && (
                <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div style={{ width: '100%', fontSize: '12px', fontWeight: 600, color: '#1a1a18' }}>자주 쓰는 기능</div>
                  <div className="chart-wrap" style={{ height: '210px', width: '260px', minWidth: '220px' }}>
                    <Doughnut
                      data={{ labels: behaviorNegCommFeatureRows.map(r => r.label), datasets: [{ data: behaviorNegCommFeatureRows.map(r => r.value), backgroundColor: behaviorNegCommFeatureRows.map(r => r.color) }] }}
                      options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }}
                    />
                  </div>
                  <div style={{ flex: '1 1 220px', minWidth: '220px' }}>
                    {behaviorNegCommFeatureRows.map(row => {
                      const pct = behaviorNegCommFeatureDen > 0 ? Math.round((row.value / behaviorNegCommFeatureDen) * 100) : 0
                      return <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '6px 0', fontSize: '11px', borderBottom: '1px solid #f0efe8' }}><div>{row.label}</div><div style={{ whiteSpace: 'nowrap', color: '#6b6b65' }}>{row.value}명 ({pct}%)</div></div>
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        {behaviorMode === 'all' && (
        <div className="card" style={{ marginTop: '16px' }}>
          <h3>캐릭터 IP 관심도 × 자주 쓰는 기능 (히트맵)</h3>
          <div style={{ fontSize: '10px', color: '#6b6b65', marginBottom: '6px' }}>
            모든 셀의 비율은 전체 기능 응답자 n={posCharInterestFeatureHeatmap.overallDen} 기준입니다.
          </div>
          {posCharInterestFeatureHeatmap.topFeatures.length === 0 ? (
            <div style={{ color: '#aaa', fontSize: '12px' }}>자주 쓰는 기능 응답 없음</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', minWidth: '760px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e2e0d8' }}>
                    <th style={{ textAlign: 'left', padding: '8px 6px', color: '#6b6b65', width: '170px' }}>관심도</th>
                    <th style={{ textAlign: 'right', padding: '8px 6px', color: '#6b6b65', width: '66px' }}>n</th>
                    {posCharInterestFeatureHeatmap.topFeatures.map(feature => (
                      <th key={feature} style={{ textAlign: 'left', padding: '8px 6px', color: '#6b6b65' }}>
                        {feature.length > 18 ? `${feature.slice(0, 18)}…` : feature}
                      </th>
                    ))}
                    {posCharInterestFeatureHeatmap.hasEtc && <th style={{ textAlign: 'left', padding: '8px 6px', color: '#6b6b65' }}>기타</th>}
                  </tr>
                </thead>
                <tbody>
                  {posCharInterestFeatureHeatmap.rows.map(row => (
                    <tr key={row.label} style={{ borderBottom: '1px solid #f0efe8' }}>
                      <td style={{ padding: '8px 6px', color: '#1a1a18', fontWeight: row.label === '전체' ? 700 : 500 }}>{row.label}</td>
                      <td style={{ padding: '8px 6px', textAlign: 'right', color: '#6b6b65' }}>{row.n}</td>
                      {posCharInterestFeatureHeatmap.topFeatures.map(feature => {
                        const v = row.counts[feature] || 0
                        const pct =
                          posCharInterestFeatureHeatmap.overallDen > 0
                            ? Math.round((v / posCharInterestFeatureHeatmap.overallDen) * 100)
                            : 0
                        const scaled = pct / posCharInterestFeatureHeatmap.maxPct
                        const alpha = Math.min(0.88, Math.max(0.06, scaled * 0.88))
                        return (
                          <td key={feature} style={{ padding: '6px' }}>
                            <div style={{ background: `rgba(29,158,117,${alpha})`, borderRadius: '4px', minHeight: '28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: scaled >= 0.55 ? '#fff' : '#1a1a18', padding: '4px 6px', fontWeight: 600 }}>
                              <span>{v}</span>
                              <span>{pct}%</span>
                            </div>
                          </td>
                        )
                      })}
                      {posCharInterestFeatureHeatmap.hasEtc && (
                        <td style={{ padding: '6px' }}>
                          <div
                            style={{
                              background: `rgba(29,158,117,${Math.min(
                                0.88,
                                Math.max(
                                  0.06,
                                  ((posCharInterestFeatureHeatmap.overallDen > 0
                                    ? Math.round((row.etcCount / posCharInterestFeatureHeatmap.overallDen) * 100)
                                    : 0) /
                                    posCharInterestFeatureHeatmap.maxPct) * 0.88
                                )
                              )})`,
                              borderRadius: '4px',
                              minHeight: '28px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              color:
                                ((posCharInterestFeatureHeatmap.overallDen > 0
                                  ? Math.round((row.etcCount / posCharInterestFeatureHeatmap.overallDen) * 100)
                                  : 0) /
                                  posCharInterestFeatureHeatmap.maxPct) >= 0.55
                                  ? '#fff'
                                  : '#1a1a18',
                              padding: '4px 6px',
                              fontWeight: 600,
                            }}
                          >
                            <span>{row.etcCount}</span>
                            <span>
                              {posCharInterestFeatureHeatmap.overallDen > 0
                                ? Math.round((row.etcCount / posCharInterestFeatureHeatmap.overallDen) * 100)
                                : 0}
                              %
                            </span>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        )}

        <div style={{height:'40px'}}></div>
      </div>
    </div>
  )
}
