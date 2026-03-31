import { HEADERS } from './surveyHeaders'

const trim = v => (v == null ? '' : String(v).trim())

export const excelTrimKeyMap = sampleRow => {
  const map = {}
  if (!sampleRow || typeof sampleRow !== 'object') return map
  Object.keys(sampleRow).forEach(rawKey => {
    map[trim(rawKey)] = rawKey
  })
  return map
}

const cell = (row, trimMap, headerText) => {
  const rawKey = trimMap[trim(headerText)]
  return trim(rawKey ? row[rawKey] : '')
}

const firstNonEmpty = (...vals) => vals.find(v => trim(v) !== '') || ''

export const normalizeRow = (row, trimMap) => {
  const mpWillBuyFollowupRaw = cell(row, trimMap, HEADERS.mp_will_buy_followup)
  const mpWillBuyColdRaw = cell(row, trimMap, HEADERS.mp_will_buy_cold)
  const mpWillYesReasonFollowupRaw = cell(row, trimMap, HEADERS.mp_will_yes_reason_followup)
  const mpWillYesReasonColdRaw = cell(row, trimMap, HEADERS.mp_will_yes_reason_cold)
  const mpWillNoReasonFollowupRaw = cell(row, trimMap, HEADERS.mp_will_no_reason_followup)
  const mpWillNoReasonColdRaw = cell(row, trimMap, HEADERS.mp_will_no_reason_cold)

  const r = {
    age: cell(row, trimMap, HEADERS.age),
    gender: cell(row, trimMap, HEADERS.gender),
    tp_know: cell(row, trimMap, HEADERS.tp_know),
    tp_consume: cell(row, trimMap, HEADERS.tp_consume),
    mp_know: cell(row, trimMap, HEADERS.mp_know),
    mp_how_know: cell(row, trimMap, HEADERS.mp_how_know),
    mp_bought: cell(row, trimMap, HEADERS.mp_bought),
    mp_buy_reason: cell(row, trimMap, HEADERS.mp_buy_reason),
    mp_will_buy_followup_raw: mpWillBuyFollowupRaw,
    mp_will_buy_cold_raw: mpWillBuyColdRaw,
    mp_will_yes_reason_followup_raw: mpWillYesReasonFollowupRaw,
    mp_will_yes_reason_cold_raw: mpWillYesReasonColdRaw,
    mp_will_no_reason_followup_raw: mpWillNoReasonFollowupRaw,
    mp_will_no_reason_cold_raw: mpWillNoReasonColdRaw,
    mp_will_buy: firstNonEmpty(mpWillBuyFollowupRaw, mpWillBuyColdRaw),
    mp_will_buy_reason: firstNonEmpty(mpWillYesReasonFollowupRaw, mpWillYesReasonColdRaw),
    mp_no_buy_reason: firstNonEmpty(mpWillNoReasonFollowupRaw, mpWillNoReasonColdRaw),
    char_interest: cell(row, trimMap, HEADERS.char_interest),
    char_interest_reason: cell(row, trimMap, HEADERS.char_interest_reason),
    char_consume_way: cell(row, trimMap, HEADERS.char_consume_way),
    comm_used: cell(row, trimMap, HEADERS.comm_used),
    comm_feature: cell(row, trimMap, HEADERS.comm_feature),
    comm_feature_reason: cell(row, trimMap, HEADERS.comm_feature_reason),
    ip_app_wish: cell(row, trimMap, HEADERS.ip_app_wish),
  }

  const know = r.mp_know === '알고 있다'
  const bought = r.mp_bought === '있다'
  const willBuy = r.mp_will_buy === '있다'
  const noBuy = r.mp_will_buy === '없다'

  if (know && bought) r.segment = 'A1'
  else if (know && !bought) r.segment = 'A2'
  else if (!know && willBuy) r.segment = 'B1'
  else if (!know && noBuy) r.segment = 'B2'
  else r.segment = 'N/A'

  r.char_consume_list = r.char_consume_way
    .split(',')
    .map(x => x.trim())
    .filter(Boolean)

  return r
}

export const runCounts = (arr, key) => arr.reduce((acc, cur) => {
  const v = cur[key] || '';
  if (!v) return acc;
  acc[v] = (acc[v] || 0) + 1;
  return acc;
}, {});

export const topN = (c, n = 8) => Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, n);
