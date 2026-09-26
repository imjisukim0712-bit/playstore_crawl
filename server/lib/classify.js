// Turns one game's store-listing signals -- Play's own listing tags, title,
// summary, the description's opening, IAP price range, age rating, release
// date -- into the design dimensions the opportunity map (포지셔닝 맵) is built
// on: core loop, setting, art style, player structure, play intensity,
// monetization depth, business model, target age, release era.
//
// Every rule reads what the listing itself says (tags first, then keywords in
// the listing text). A game whose listing gives no evidence for a dimension
// is left UNCLASSIFIED rather than guessed, same policy as index.js's
// classifySubGenre.

const UNCLASSIFIED = '미분류';

const GENRE_ID_LABEL = {
  GAME_ACTION: '액션', GAME_ADVENTURE: '어드벤처', GAME_ARCADE: '아케이드', GAME_BOARD: '보드',
  GAME_CARD: '카드', GAME_CASINO: '카지노', GAME_CASUAL: '캐주얼', GAME_EDUCATIONAL: '교육',
  GAME_MUSIC: '음악', GAME_PUZZLE: '퍼즐', GAME_RACING: '레이싱', GAME_ROLE_PLAYING: '롤플레잉',
  GAME_SIMULATION: '시뮬레이션', GAME_SPORTS: '스포츠', GAME_STRATEGY: '전략', GAME_TRIVIA: '퀴즈',
  GAME_WORD: '낱말',
};
function genreLabelOf(genreId, fallbackText) {
  return GENRE_ID_LABEL[genreId] || fallbackText || '기타';
}

// The Play Store '출시일'/released field comes back in whatever locale the
// store was queried in. JS Date() parses "2026. 8. 20." (ko), "Apr 11, 2023"
// (en) and "2021/02/17" (ja) natively; Russian's Cyrillic month name needs a
// small manual lookup.
const RU_MONTHS = [['мар', 3], ['ма', 5], ['янв', 1], ['фев', 2], ['апр', 4], ['июн', 6], ['июл', 7], ['авг', 8], ['сен', 9], ['окт', 10], ['ноя', 11], ['дек', 12]];
function parseReleased(str) {
  if (!str) return null;
  const ru = String(str).match(/^(\d{1,2})\s+([а-яё]+)\.?\s*(\d{4})/iu);
  if (ru) {
    const token = ru[2].toLowerCase();
    const month = RU_MONTHS.find(([prefix]) => token.startsWith(prefix));
    if (!month) return null;
    const d = new Date(Date.UTC(+ru[3], month[1] - 1, +ru[1]));
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

// --- Grossing rank -> relative revenue weight ---
// Top-grossing revenue falls off steeply with rank, roughly as a power law.
// rank^-0.8 is a deliberately simple stand-in: it is only used to compare
// segments against each other ("this combination holds ~12% of the chart's
// revenue"), never shown as an absolute amount.
const RANK_WEIGHT_EXPONENT = 0.8;
function rankWeight(rank) {
  return rank > 0 ? Math.pow(rank, -RANK_WEIGHT_EXPONENT) : 0;
}

// --- IAP price range -> highest single item price, in USD ---
// Approximate units-per-USD, only used to put the priciest item into one of
// three coarse tiers -- a few percent of FX drift never moves a game across one.
const FX_PER_USD = { KRW: 1400, USD: 1, GBP: 0.78, INR: 88, IDR: 16500, RUB: 85, JPY: 148 };
const MARKET_CURRENCY = { kr: 'KRW', us: 'USD', gb: 'GBP', in: 'INR', id: 'IDR', ru: 'RUB', jp: 'JPY' };

function toNumber(token) {
  let t = token.replace(/[\s  ]/g, '');
  const lastComma = t.lastIndexOf(','), lastDot = t.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    t = lastComma > lastDot ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  } else if (lastComma >= 0) {
    t = /,\d{1,2}$/.test(t) && t.indexOf(',') === lastComma ? t.replace(',', '.') : t.replace(/,/g, '');
  } else if ((t.match(/\./g) || []).length > 1) {
    t = t.replace(/\./g, '');
  }
  const v = parseFloat(t);
  return isNaN(v) ? null : v;
}
function maxIapPrice(iapRange) {
  if (!iapRange) return null;
  const tokens = String(iapRange).match(/\d{1,3}(?:[\s  ]\d{3})+(?:[.,]\d+)?|\d[\d.,]*\d|\d/g) || [];
  const nums = tokens.map(toNumber).filter(v => v != null);
  return nums.length ? Math.max(...nums) : null;
}
function maxIapUsd(iapRange, marketCode) {
  const max = maxIapPrice(iapRange);
  const fx = FX_PER_USD[MARKET_CURRENCY[marketCode]];
  return max != null && fx ? max / fx : null;
}

// --- Age rating text (GRAC / ESRB / PEGI / IARC, in whichever locale) -> minimum age ---
function parseMinAge(text) {
  const s = String(text || '').trim();
  if (!s) return null;
  if (/청소년\s*이용\s*불가|Adults only/i.test(s)) return 19;
  if (/전체\s*이용가|^Everyone$|^Rated for 3\+|^전체$/i.test(s)) return 0;
  if (/^청소년$|^Teen$/i.test(s)) return 13;
  if (/^Mature/i.test(s)) return 17;
  if (/부모\s*지도|Parental/i.test(s)) return 10;
  const m = s.match(/(\d{1,2})/);
  return m ? +m[1] : null;
}

// --- Dimension definitions (display order = value order in each list) ---
const DIMENSIONS = [
  {
    key: 'core', label: '핵심 장르(루프)',
    hint: '플레이 루프 기준 세부 장르 — Play 태그(4X·MMORPG·방치형 RPG·타워 디펜스 등) → 제목·요약 키워드 → Play 장르 순으로 판정',
    order: ['MMORPG', '4X·SLG', '방치형', '수집형 RPG', '액션 RPG', 'RPG 기타', '타워 디펜스', '전략 기타', '슈팅', 'MOBA·대전', '액션 기타', '어드벤처', '퍼즐', '머지', '경영·시뮬', '샌드박스', '캐주얼·아케이드', '카지노·보드·카드', '스포츠', '레이싱', '기타'],
  },
  {
    key: 'setting', label: '세계관·테마',
    hint: 'Play 태그(판타지·동양 판타지·SF·좀비·현대 등)와 제목·요약 키워드 기준',
    order: ['판타지', '동양·무협', 'SF·우주', '아포칼립스·생존', '밀리터리·현대', '역사', '일상·라이프', '스포츠·레이싱', '추상·캐주얼'],
    // '추상·캐주얼' means "no real theme" (puzzle/casino fallback) -- an empty
    // 4X × 추상·캐주얼 cell is not a white space anyone could build into.
    gapExcluded: ['추상·캐주얼'],
  },
  {
    key: 'art', label: '아트 스타일',
    hint: 'Play 태그(리얼리티·스타일·애니메이션·만화·픽셀) 기준, 태그가 없으면 설명 키워드(실사·서브컬처 등)',
    order: ['실사', '스타일라이즈드', '카툰', '애니·서브컬처', '픽셀'],
  },
  {
    key: 'mode', label: '플레이 구조',
    hint: 'MMORPG=MMO, 4X·SLG=서버전(경쟁), 그 외 Play 태그(경쟁형·협동형 멀티플레이어·싱글 플레이어)',
    order: ['싱글 중심', '협동·소셜', '경쟁 PvP', 'MMO'],
  },
  {
    key: 'intensity', label: '플레이 강도',
    hint: '핵심 장르로 판정: 퍼즐·머지·방치형·경영·카지노=라이트 / MMORPG·4X·슈팅·MOBA=하드코어 / 나머지=미드코어',
    order: ['라이트', '미드코어', '하드코어'],
  },
  {
    key: 'monet', label: '과금 강도',
    hint: '가장 비싼 인앱 상품 가격(달러 환산) 기준 — 고래 과금 설계인지 가벼운 과금인지',
    order: ['IAP 없음', '라이트 ≤$50', '표준 $50~150', '헤비 $150+'],
  },
  {
    key: 'biz', label: '수익 모델',
    hint: '인앱결제·광고·유료 구매 여부 조합',
    order: ['IAP 전용', 'IAP+광고', '광고 전용', '유료 구매', '수익화 없음'],
  },
  {
    key: 'age', label: '타깃 연령',
    hint: '스토어 연령 등급(GRAC·ESRB·PEGI) 기준',
    order: ['전체', '10~12세', '13~16세', '성인(17+)'],
  },
  {
    key: 'era', label: '출시 시기',
    hint: '기준일 대비 출시 경과 — 신작이 뚫고 들어간 구간인지, 오래된 강자만 있는 구간인지',
    order: ['1년 이내', '1~3년', '3~6년', '6년 이상'],
  },
];

function hasAny(tagSet, list) {
  for (const t of list) if (tagSet.has(t)) return true;
  return false;
}

function classifyCore(g, T, head, all) {
  const gid = g.genreId;
  if (hasAny(T, ['MMORPG']) || /MMORPG|MMO\s?RPG|\bMMO\b/i.test(all) || g.subGenre === 'MMORPG') return 'MMORPG';
  if (hasAny(T, ['4X', '제국 건설', '빌드 앤 배틀', '문명']) || /SLG|4X/.test(head)) return '4X·SLG';
  if (hasAny(T, ['병합']) || /머지|Merge|합성/i.test(g.title || '')) return '머지';
  if (hasAny(T, ['방치형 RPG', '방치형']) || g.subGenre === '방치형' || /방치형|키우기|Idle/i.test(head)) return '방치형';
  if (hasAny(T, ['타워 디펜스']) || /디펜스|Defen[cs]e/i.test(head)) return '타워 디펜스';
  if (hasAny(T, ['턴 방식 RPG', '카드 배틀', '매치3 RPG', '퍼즐 롤플레잉', '물리 퍼즐 RPG']) || g.subGenre === '수집형·서브컬처' || /수집형|가챠|서브컬처|턴제/.test(all)) return '수집형 RPG';
  if (hasAny(T, ['액션 롤플레잉']) || /액션\s?RPG|ARPG|핵앤슬래시/i.test(all) || (gid === 'GAME_ROLE_PLAYING' && hasAny(T, ['액션 어드벤처']))) return '액션 RPG';
  if (hasAny(T, ['전술 슈팅', '슈팅', '대포 슈팅']) || /슈팅|FPS|TPS|배틀\s?로얄|Shooter/i.test(head)) return '슈팅';
  if (hasAny(T, ['MOBA', '격투', '비대칭 배틀 아레나', '오토 체스', 'IO 게임']) || /MOBA|AOS/.test(head)) return 'MOBA·대전';
  if (hasAny(T, ['3단 타일 맞추기', '매치3 어드벤처', '맞추기', '매칭', '짝 맞추기', '연결', '캔디', '마작 솔리테르', '트리픽스', '블록', '숨은그림찾기', '논리', '두뇌 게임', '색칠하기']) || gid === 'GAME_PUZZLE' || gid === 'GAME_WORD' || gid === 'GAME_TRIVIA') return '퍼즐';
  if (['GAME_CASINO', 'GAME_BOARD', 'GAME_CARD'].includes(gid) || hasAny(T, ['슬롯', '포커', '빙고', '텍사스 홀덤', '틴 패티', '루도', '루미', '도미노', '카지노 어드벤처', '주사위', '보드 게임', '바둑', '체스', '마작', '솔리테르', '라스트 카드'])) return '카지노·보드·카드';
  if (gid === 'GAME_SPORTS' || hasAny(T, ['축구', '야구', '크리켓', '골프', '테니스', '배구', '농구', '당구', '포켓볼', '레슬링'])) return '스포츠';
  if (gid === 'GAME_RACING' || hasAny(T, ['자동차 경주', '카트', '고카트', '자전거 경주'])) return '레이싱';
  if (hasAny(T, ['샌드박스', '공예'])) return '샌드박스';
  if (gid === 'GAME_SIMULATION' || hasAny(T, ['경영', '타이쿤', '비즈니스 제국', '농사', '농장', '라이프스타일', '디자인', '요리', '카페 및 식당', '음식점', '옷 입히기', '돌보기', '반려동물', '생활'])) return '경영·시뮬';
  if (gid === 'GAME_ROLE_PLAYING') return 'RPG 기타';
  if (gid === 'GAME_STRATEGY') return '전략 기타';
  if (gid === 'GAME_ACTION') return '액션 기타';
  if (gid === 'GAME_ADVENTURE') return '어드벤처';
  if (gid === 'GAME_ARCADE' || gid === 'GAME_CASUAL' || hasAny(T, ['러너', '플랫폼 게임', '점프', '하이퍼캐주얼'])) return '캐주얼·아케이드';
  return gid ? '기타' : UNCLASSIFIED;
}

const THEMELESS_CORES = ['퍼즐', '머지', '카지노·보드·카드', '캐주얼·아케이드'];
function classifySetting(g, T, head, all, core) {
  const gid = g.genreId;
  if (hasAny(T, ['동양 판타지', '무협', '삼국지', '고대 중국', '동양 신화', '사무라이', '무술']) || /무협|삼국지|동양\s?판타지|강호/.test(all)) return '동양·무협';
  if (hasAny(T, ['좀비', '세계 종말', '서바이벌']) || /좀비|아포칼립스|종말|Zombie/i.test(all) || /생존|살아남|서바이벌|Survival|설원|빙하기/i.test(head)) return '아포칼립스·생존';
  if (hasAny(T, ['SF', '우주', 'SF/판타지', '로봇']) || /\bSF\b|우주|은하|사이버펑크|메카/.test(head)) return 'SF·우주';
  if (hasAny(T, ['현대', '군대', '특수 부대', '경찰', '범죄', '해군', '총']) || /밀리터리|현대전|범죄|마피아|갱스터|특수부대/.test(head)) return '밀리터리·현대';
  if (hasAny(T, ['Historical', '문명', '선사 시대', '제국 건설']) || /역사/.test(head)) return '역사';
  if (hasAny(T, ['판타지', '중세 판타지', '중세', '기사', '용', '마술', '다크 판타지', '서양 신화', '신화', '바이킹', '동화', '이세계물', '도시 판타지', '악마', '불멸의 영웅', '괴물', '전사']) || /판타지|마법|드래곤|용사|신화|이세계|중세|왕국|영지|던전|몬스터|마왕|뱀파이어|천족|마족|소환사/.test(all)) return '판타지';
  if (hasAny(T, ['라이프스타일', '농사', '농장', '요리', '카페 및 식당', '음식', '음식점', '디자인', '동물', '고양이', '반려동물', '로맨스', '데이트', '학교', '옷 입히기', '생활', '섬', '돌보기', '여학생', '유명인 및 아이돌']) || /정원|인테리어|꾸미기|리모델링|리노베이션|저택|마을|요리|카페|농장|연애|로맨스/.test(head)) return '일상·라이프';
  if (gid === 'GAME_SPORTS' || gid === 'GAME_RACING' || hasAny(T, ['축구', '야구', '크리켓', '골프', '테니스', '배구', '자동차 경주', '카트', '스포츠카'])) return '스포츠·레이싱';
  if (hasAny(T, ['추상', '캔디', '추상 전략']) || ['GAME_PUZZLE', 'GAME_CASINO', 'GAME_BOARD', 'GAME_CARD', 'GAME_WORD', 'GAME_TRIVIA'].includes(gid) || THEMELESS_CORES.includes(core)) return '추상·캐주얼';
  return UNCLASSIFIED;
}

function classifyArt(g, T, head, all) {
  if (hasAny(T, ['픽셀']) || /픽셀|도트\s?그래픽|Pixel/i.test(all)) return '픽셀';
  if (hasAny(T, ['애니메이션', '이세계물']) || /서브컬처|미소녀|애니풍|애니메이션|아니메/.test(all)) return '애니·서브컬처';
  if (hasAny(T, ['만화', '귀여움', '웃김']) || /카툰|귀여운|귀염/.test(all)) return '카툰';
  if (hasAny(T, ['리얼리티', '리얼리티 스타일']) || /실사|언리얼|극사실|하이엔드\s?그래픽|포토리얼|사실적인\s?그래픽/.test(all)) return '실사';
  if (hasAny(T, ['스타일', '로우 폴리', '추상'])) return '스타일라이즈드';
  return UNCLASSIFIED;
}

function classifyMode(core, T) {
  if (core === 'MMORPG') return 'MMO';
  if (core === '4X·SLG') return '경쟁 PvP';
  if (hasAny(T, ['경쟁형 멀티플레이어', '경쟁', 'MOBA', '격투', 'IO 게임', '비대칭 배틀 아레나'])) return '경쟁 PvP';
  if (hasAny(T, ['협동형 멀티플레이어', '멀티플레이어', '소셜', '파티'])) return '협동·소셜';
  if (hasAny(T, ['싱글 플레이어', '오프라인'])) return '싱글 중심';
  if (core === '슈팅' || core === 'MOBA·대전') return '경쟁 PvP';
  return UNCLASSIFIED;
}

const LIGHT_CORES = ['퍼즐', '머지', '카지노·보드·카드', '캐주얼·아케이드', '경영·시뮬', '방치형'];
const HARD_CORES = ['MMORPG', '4X·SLG', '슈팅', 'MOBA·대전'];
function classifyIntensity(core) {
  if (core === UNCLASSIFIED || core === '기타') return UNCLASSIFIED;
  if (LIGHT_CORES.includes(core)) return '라이트';
  if (HARD_CORES.includes(core)) return '하드코어';
  return '미드코어';
}

function classifyMonet(g, usd) {
  if (!g.offersIAP) return 'IAP 없음';
  if (usd == null) return UNCLASSIFIED;
  if (usd <= 50) return '라이트 ≤$50';
  if (usd <= 150) return '표준 $50~150';
  return '헤비 $150+';
}

function classifyBiz(g) {
  if (g.price > 0) return '유료 구매';
  if (g.offersIAP && g.adSupported) return 'IAP+광고';
  if (g.offersIAP) return 'IAP 전용';
  if (g.adSupported) return '광고 전용';
  return '수익화 없음';
}

function classifyAge(minAge) {
  if (minAge == null) return UNCLASSIFIED;
  if (minAge <= 7) return '전체';
  if (minAge <= 12) return '10~12세';
  if (minAge <= 16) return '13~16세';
  return '성인(17+)';
}

function classifyEra(daysSinceRelease) {
  if (daysSinceRelease == null || daysSinceRelease < 0) return UNCLASSIFIED;
  if (daysSinceRelease <= 365) return '1년 이내';
  if (daysSinceRelease <= 365 * 3) return '1~3년';
  if (daysSinceRelease <= 365 * 6) return '3~6년';
  return '6년 이상';
}

// g: { genreId, title, summary, desc, subGenre, tags[], offersIAP, adSupported,
//      price, iapRange, contentRating, daysSinceRelease }
function classifyGame(g, marketCode) {
  const T = new Set(g.tags || []);
  const head = `${g.title || ''} ${g.summary || ''}`;
  const all = `${head} ${g.desc || ''}`;
  const core = classifyCore(g, T, head, all);
  const usd = maxIapUsd(g.iapRange, marketCode);
  return {
    dims: {
      core,
      setting: classifySetting(g, T, head, all, core),
      art: classifyArt(g, T, head, all),
      mode: classifyMode(core, T),
      intensity: classifyIntensity(core),
      monet: classifyMonet(g, usd),
      biz: classifyBiz(g),
      age: classifyAge(parseMinAge(g.contentRating)),
      era: classifyEra(g.daysSinceRelease),
    },
    iapMaxUsd: usd != null ? Math.round(usd) : null,
  };
}

module.exports = {
  UNCLASSIFIED,
  GENRE_ID_LABEL,
  genreLabelOf,
  parseReleased,
  RANK_WEIGHT_EXPONENT,
  rankWeight,
  maxIapPrice,
  maxIapUsd,
  parseMinAge,
  DIMENSIONS,
  classifyGame,
};
