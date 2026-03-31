export const KEY_MAP = [
  {key:'age', labels:['연령대','age']},
  {key:'gender', labels:['성별','gender']},
  {key:'tp_know', labels:['캐치! 티니핑을 알고','티니핑을 알고']},
  {key:'tp_consume', labels:['티니핑 관련 소비 경험']},
  {key:'mp_know', labels:['마이핑을 알고','마이핑 관련']},
  {key:'mp_how_know', labels:['처음 알게 된 경로','알게 된 경로']},
  {key:'mp_bought', labels:['구매해본 경험','구매 경험']},
  {key:'mp_buy_reason', labels:['구매한 이유','구매 이유']},
  {key:'mp_will_buy', labels:['구매 의향','의향']},
  {key:'mp_will_buy_reason', labels:['구매 의향 이유','구매의향 이유']},
  {key:'char_interest', labels:['캐릭터 굿즈나 콘텐츠에 관심']},
  {key:'char_interest_reason', labels:['관심을 갖게 된 주된 이유','관심 이유']},
  {key:'char_consume_way', labels:['소비하는 방식','소비 방식']},
  {key:'comm_used', labels:['커뮤니티성 서비스를 사용해본 경험','커뮤니티 이용 경험']},
  {key:'comm_feature', labels:['가장 자주 사용한 기능','커뮤니티 기능']},
  {key:'comm_feature_reason', labels:['선택한 기능을 사용하는 이유','기능 사용 이유']}
];

export const rawToKey = title => {
  const normalized = title ? title.toString().replace(/\s+/g, ' ').trim().toLowerCase() : '';

  // 연령대
  if (normalized.includes('연령대') || normalized.includes('연령대를 선택')) return 'age';

  // 성별
  if (normalized.includes('성별') || normalized.includes('성별을 선택')) return 'gender';

  // 티니핑 관련
  if (normalized.includes('티니핑') && normalized.includes('알고 있나요')) return 'tp_know';
  if (normalized.includes('티니핑') && normalized.includes('소비 경험')) return 'tp_consume';

  // 마이핑 관련
  if (normalized.includes('마이핑') && normalized.includes('알고 계신가요') || normalized.includes('마이핑') && normalized.includes('알고 있나요')) return 'mp_know';
  if (normalized.includes('마이핑') && normalized.includes('알게 된 계기')) return 'mp_how_know';
  if (normalized.includes('마이핑') && normalized.includes('구매해본 경험')) return 'mp_bought';
  if (normalized.includes('구매한 이유가 무엇인가요')) return 'mp_buy_reason';
  if (normalized.includes('추가 구매 의사') || normalized.includes('해당 제품을 구매할 의향이 있나요')) return 'mp_will_buy';
  if (normalized.includes('추가 구매를 희망하는 이유') || normalized.includes('구매 의향이 있는 이유')) return 'mp_will_buy_reason';
  if (normalized.includes('추가 구매를 희망하지 않는 이유') || normalized.includes('구매 의향이 없는 이유')) return 'mp_no_buy_reason';

  // 캐릭터 관련
  if (normalized.includes('캐릭터 굿즈나 콘텐츠') && normalized.includes('관심이 있나요')) return 'char_interest';
  if (normalized.includes('캐릭터 굿즈나 콘텐츠') && normalized.includes('관심을 갖게 된')) return 'char_interest_reason';
  if (normalized.includes('캐릭터를 소비하는 방식')) return 'char_consume_way';

  // 커뮤니티 관련
  if (normalized.includes('커뮤니티성 서비스') && normalized.includes('사용해본 경험')) return 'comm_used';
  if (normalized.includes('커뮤니티성 서비스') && normalized.includes('가장 자주 사용한 기능')) return 'comm_feature';
  if (normalized.includes('선택한 기능을 사용하는 이유')) return 'comm_feature_reason';

  return null;
};

export const normalizeRow = (row, headerMap) => {
  const r = {};
  for (const rawKey in row) {
    const mapped = headerMap[rawKey];
    if (!mapped) continue;
    const val = row[rawKey];
    r[mapped] = (typeof val === 'string' ? val.trim() : val || '');
  }

  for (const field of ['age','gender','tp_know','tp_consume','mp_know','mp_how_know','mp_bought','mp_buy_reason','mp_will_buy','mp_will_buy_reason','mp_no_buy_reason','char_interest','char_interest_reason','char_consume_way','comm_used','comm_feature','comm_feature_reason']) {
    if (!Object.prototype.hasOwnProperty.call(r, field)) r[field] = '';
  }

  const know = r.mp_know === '알고 있다';
  const bought = r.mp_bought === '있다';
  const willbuy = r.mp_will_buy === '있다';
  const nobuy = r.mp_will_buy === '없다';

  if (know && bought) r.segment='A1';
  else if (know && !bought) r.segment='A2';
  else if (!know && willbuy) r.segment='B1';
  else if (!know && nobuy) r.segment='B2';
  else r.segment='N/A';

  r.char_consume_list = r.char_consume_way.split(',').map(x=>x.trim()).filter(Boolean);

  return r;
};

export const runCounts = (arr, key) => arr.reduce((acc, cur) => {
  const v = cur[key] || '';
  if (!v) return acc;
  acc[v] = (acc[v] || 0) + 1;
  return acc;
}, {});

export const topN = (c, n = 8) => Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, n);
