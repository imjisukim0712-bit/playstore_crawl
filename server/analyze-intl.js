// Aggregates the international-market snapshots (server/output/intl/<code>/**/*.xlsx
// plus today's KR folder for reference) into docs/global-data.js, consumed by
// docs/global.html. Companion to analyze.js, which owns the KR-only deep history.
//
// Usage: node analyze-intl.js  (run from server/, same as analyze.js)

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const outputDir = path.join(__dirname, 'output');
const intlDir = path.join(outputDir, 'intl');
const docsDir = path.join(__dirname, '..', 'docs');
const DATE_FOLDER_RE = /^\d{6}$/;
const FILENAME_RE = /^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})$/;
const GENRE_FOLD_N = 7;

const MARKETS = [
  { code: 'kr', label: '대한민국', flag: '🇰🇷', metric: 'GROSSING', metricLabel: '매출 순위', dir: outputDir, dateFolderCheck: true },
  { code: 'us', label: '미국', flag: '🇺🇸', metric: 'GROSSING', metricLabel: '매출 순위', dir: path.join(intlDir, 'us') },
  { code: 'jp', label: '일본', flag: '🇯🇵', metric: 'GROSSING', metricLabel: '매출 순위', dir: path.join(intlDir, 'jp') },
  { code: 'ru', label: '러시아', flag: '🇷🇺', metric: 'TOP_FREE', metricLabel: '인기 무료 순위', dir: path.join(intlDir, 'ru'), note: 'Google Play 결제가 러시아에서 중단되어 있어 매출 차트를 제공하지 않습니다. 대신 인기 무료 순위를 수집합니다.' },
];

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

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  let results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results = results.concat(walk(full));
    else if (entry.isFile() && entry.name.endsWith('.xlsx')) results.push(full);
  }
  return results;
}

function parseTimestamp(filePath) {
  const base = path.basename(filePath, '.xlsx');
  const m = base.match(FILENAME_RE);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  return { date: `${y}-${mo}-${d}`, ms: Date.UTC(+y, +mo - 1, +d, +h, +mi, +s) };
}

// Picks one closing snapshot per calendar date, same resampling rule as analyze.js.
function loadMarketHistory(market) {
  let files = walk(market.dir);
  if (market.dateFolderCheck) {
    // market.dir is the shared server/output root for KR -- exclude the intl/ subtree entirely.
    files = files.filter(f => !f.startsWith(intlDir + path.sep));
  }
  files = files.filter(f => DATE_FOLDER_RE.test(path.basename(path.dirname(f))));
  const byDate = new Map();
  for (const f of files) {
    const ts = parseTimestamp(f);
    if (!ts) continue;
    const prev = byDate.get(ts.date);
    if (!prev || ts.ms > prev.ms) byDate.set(ts.date, { file: f, ms: ts.ms });
  }
  const dates = [...byDate.keys()].sort();
  const snapshots = dates.map(date => {
    const wb = XLSX.readFile(byDate.get(date).file);
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    return rows
      .map(r => ({
        rank: Number(r['순위']),
        name: String(r['앱 이름'] || '').trim(),
        publisher: String(r['퍼블리셔'] || '').trim() || 'Unknown',
        genreId: String(r['장르ID'] || '').trim(),
        genreText: String(r['세부 카테고리'] || '').trim(),
        appId: String(r['앱ID'] || '').trim(),
        icon: String(r['아이콘'] || '').trim(),
      }))
      .filter(r => r.name && r.rank)
      .sort((a, b) => a.rank - b.rank);
  });
  return { dates, snapshots };
}

const marketData = MARKETS.map(market => {
  const { dates, snapshots } = loadMarketHistory(market);
  return { ...market, dates, snapshots, latest: snapshots[snapshots.length - 1] || [], latestDate: dates[dates.length - 1] || null };
});

const available = marketData.filter(m => m.latest.length > 0);
if (available.length === 0) {
  console.error('No international/KR snapshots found -- run the scrapers first.');
  process.exit(1);
}

// --- Genre mix per market, folded to ONE global top-N set so color/identity stays
// consistent across every market's bar (never re-picked per market). ---
const pooledGenreCounts = new Map();
available.forEach(m => {
  m.latest.forEach(r => {
    const label = genreLabelOf(r.genreId, r.genreText);
    pooledGenreCounts.set(label, (pooledGenreCounts.get(label) || 0) + 1);
  });
});
const topGenresGlobal = [...pooledGenreCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, GENRE_FOLD_N).map(([name]) => name);

function genreShareFor(snap) {
  const counts = new Map();
  snap.forEach(r => {
    const label = genreLabelOf(r.genreId, r.genreText);
    const key = topGenresGlobal.includes(label) ? label : '기타';
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  const total = snap.length || 1;
  return topGenresGlobal
    .map(name => ({ name, count: counts.get(name) || 0 }))
    .concat([{ name: '기타', count: counts.get('기타') || 0 }])
    .map(g => ({ ...g, pct: Math.round((g.count / total) * 1000) / 10 }));
}

// --- Cross-market presence: same appId charting in 2+ markets right now ---
const appIndex = new Map(); // appId -> [{marketCode, marketLabel, rank, name, publisher, icon}]
available.forEach(m => {
  m.latest.forEach(r => {
    if (!r.appId) return;
    if (!appIndex.has(r.appId)) appIndex.set(r.appId, []);
    appIndex.get(r.appId).push({ market: m.code, marketLabel: m.label, flag: m.flag, rank: r.rank, name: r.name, publisher: r.publisher, icon: r.icon || '' });
  });
});
const globalHits = [...appIndex.entries()]
  .filter(([, entries]) => entries.length >= 2)
  .map(([appId, entries]) => ({
    appId,
    icon: (entries.find(e => e.icon) || {}).icon || '',
    entries: entries.sort((a, b) => a.rank - b.rank),
    marketCount: entries.length,
    bestRank: Math.min(...entries.map(e => e.rank)),
  }))
  .sort((a, b) => b.marketCount - a.marketCount || a.bestRank - b.bestRank);

// --- Publisher cross-market reach (by publisher name, looser than appId) ---
const publisherIndex = new Map();
available.forEach(m => {
  const seen = new Set();
  m.latest.forEach(r => {
    if (seen.has(r.publisher)) return; // count each publisher once per market
    seen.add(r.publisher);
    if (!publisherIndex.has(r.publisher)) publisherIndex.set(r.publisher, []);
    publisherIndex.get(r.publisher).push({ market: m.code, marketLabel: m.label, flag: m.flag });
  });
});
const globalPublishers = [...publisherIndex.entries()]
  .filter(([, markets]) => markets.length >= 2)
  .map(([publisher, markets]) => ({ publisher, markets, marketCount: markets.length }))
  .sort((a, b) => b.marketCount - a.marketCount);

const data = {
  generatedAt: new Date().toISOString(),
  markets: available.map(m => ({
    code: m.code,
    label: m.label,
    flag: m.flag,
    metric: m.metric,
    metricLabel: m.metricLabel,
    note: m.note || null,
    date: m.latestDate,
    daysTracked: m.dates.length,
    top: m.latest.slice(0, 10).map(r => ({ rank: r.rank, name: r.name, publisher: r.publisher, genre: genreLabelOf(r.genreId, r.genreText), appId: r.appId || '', icon: r.icon || '' })),
    genreShare: genreShareFor(m.latest),
  })),
  globalHits: globalHits.slice(0, 20),
  globalPublishers: globalPublishers.slice(0, 20),
};

if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });
const outPath = path.join(docsDir, 'global-data.js');
fs.writeFileSync(outPath, `window.GLOBAL_DATA = ${JSON.stringify(data)};\n`, 'utf-8');
console.log(`Markets: ${available.map(m => m.code + '(' + m.dates.length + 'd)').join(', ')}`);
console.log(`Global hits (2+ markets): ${globalHits.length}, global publishers: ${globalPublishers.length}`);
console.log(`Wrote ${outPath} (${(fs.statSync(outPath).size / 1024).toFixed(1)} KB)`);
