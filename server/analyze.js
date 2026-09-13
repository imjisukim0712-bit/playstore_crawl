// Aggregates every collected Play Store grossing snapshot (server/output/**/*.xlsx)
// into one compact dataset for the analysis dashboard at docs/index.html.
//
// Usage: node analyze.js   (run from the server/ directory, or via `node server/analyze.js`)
//
// Output: ../docs/data.js  -- `window.PLAYSTORE_DATA = {...}` (plain JS, no build step,
// loadable via a <script> tag so the dashboard works as a static file with no server).

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const outputDir = path.join(__dirname, 'output');
const docsDir = path.join(__dirname, '..', 'docs');
const DATE_FOLDER_RE = /^\d{6}$/; // YYMMDD, e.g. 260912
const FILENAME_RE = /^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})$/;
const TOP_MOVERS_N = 8;
const TREND_DEFAULT_N = 8; // matches the dataviz categorical palette's adjacent-pairs cap
const GENRE_FOLD_N = 7; // token ceiling; the rest fold into "기타"
const PUBLISHER_TOP_N = 15;

function walk(dir) {
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
  return {
    date: `${y}-${mo}-${d}`,
    time: `${h}:${mi}:${s}`,
    ms: Date.UTC(+y, +mo - 1, +d, +h, +mi, +s),
  };
}

// --- 1. Pick one "closing" snapshot per calendar date (the latest run that day) ---
const candidateFiles = walk(outputDir).filter(f => DATE_FOLDER_RE.test(path.basename(path.dirname(f))));

const byDate = new Map();
for (const f of candidateFiles) {
  const ts = parseTimestamp(f);
  if (!ts) continue;
  const prev = byDate.get(ts.date);
  if (!prev || ts.ms > prev.ms) byDate.set(ts.date, { file: f, ...ts });
}

const dates = [...byDate.keys()].sort();
if (dates.length === 0) {
  console.error('No dated snapshots found under', outputDir);
  process.exit(1);
}

// --- 2. Parse each chosen snapshot, build per-game rank history + per-date top100 lists ---
const games = new Map(); // name -> { name, publisher, genre, ranks: [] }
const snapshots = []; // per date index: [{rank, name, publisher, genre}, ...] sorted by rank

dates.forEach((date, di) => {
  const { file, time } = byDate.get(date);
  const wb = XLSX.readFile(file);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
  const snap = [];
  for (const r of rows) {
    const rank = Number(r['순위']);
    const name = String(r['앱 이름'] || '').trim();
    const publisher = String(r['퍼블리셔'] || '').trim() || 'Unknown';
    const genre = String(r['세부 카테고리'] || '').trim();
    const category = String(r['카테고리'] || '').trim();
    if (!name || !rank || category !== '게임') continue;
    if (!games.has(name)) games.set(name, { name, publisher, genre, ranks: new Array(dates.length).fill(null) });
    const g = games.get(name);
    g.ranks[di] = rank;
    if (publisher) g.publisher = publisher; // keep the most recently seen publisher/genre label
    if (genre) g.genre = genre;
    snap.push({ rank, name, publisher, genre });
  }
  snap.sort((a, b) => a.rank - b.rank);
  snapshots.push({ date, time, count: snap.length });
  snap._date = date;
  snapshots[di].rows = snap;
});

const gameList = [...games.values()];
const latestIdx = dates.length - 1;
const latestSnap = snapshots[latestIdx].rows;

// --- 3. Helpers ---
function indexAtOrBefore(targetMs) {
  let idx = -1;
  for (let i = 0; i < dates.length; i++) {
    const ms = Date.parse(dates[i] + 'T00:00:00Z');
    if (ms <= targetMs) idx = i; else break;
  }
  return idx;
}
const latestMs = Date.parse(dates[latestIdx] + 'T00:00:00Z');
const idx7dAgo = indexAtOrBefore(latestMs - 7 * 86400000);
const idx30dAgo = indexAtOrBefore(latestMs - 30 * 86400000);
const idxPrevDay = latestIdx > 0 ? latestIdx - 1 : -1;

function rankOf(game, idx) {
  return idx >= 0 ? game.ranks[idx] : null;
}

// --- 4. Notable changes: risers / fallers / new entries / dropouts (latest vs previous day) ---
const presentBoth = gameList.filter(g => rankOf(g, latestIdx) != null && rankOf(g, idxPrevDay) != null);
const movers = presentBoth
  .map(g => ({ name: g.name, publisher: g.publisher, genre: g.genre, rank: g.ranks[latestIdx], change: g.ranks[idxPrevDay] - g.ranks[latestIdx] }))
  .filter(m => m.change !== 0);
const topRisers = [...movers].sort((a, b) => b.change - a.change).slice(0, TOP_MOVERS_N);
const topFallers = [...movers].sort((a, b) => a.change - b.change).slice(0, TOP_MOVERS_N);

const newEntries = idxPrevDay >= 0
  ? gameList
      .filter(g => rankOf(g, latestIdx) != null && rankOf(g, idxPrevDay) == null)
      .map(g => ({ name: g.name, publisher: g.publisher, genre: g.genre, rank: g.ranks[latestIdx] }))
      .sort((a, b) => a.rank - b.rank)
      .slice(0, TOP_MOVERS_N)
  : [];
const dropouts = idxPrevDay >= 0
  ? gameList
      .filter(g => rankOf(g, latestIdx) == null && rankOf(g, idxPrevDay) != null)
      .map(g => ({ name: g.name, publisher: g.publisher, genre: g.genre, rank: g.ranks[idxPrevDay] }))
      .sort((a, b) => a.rank - b.rank)
      .slice(0, TOP_MOVERS_N)
  : [];

// --- 5. Longest-running #1, steadiest top performer ---
function daysAtRankLE(game, n) {
  return game.ranks.filter(r => r != null && r <= n).length;
}
const daysNo1 = gameList
  .map(g => ({ name: g.name, publisher: g.publisher, days: game_daysAt1(g) }))
  .sort((a, b) => b.days - a.days)
  .slice(0, 5);
function game_daysAt1(g) { return g.ranks.filter(r => r === 1).length; }

const presenceThreshold = Math.max(1, Math.round(dates.length * 0.8));
const steadiest = gameList
  .filter(g => g.ranks.filter(r => r != null).length >= presenceThreshold)
  .map(g => {
    const present = g.ranks.filter(r => r != null);
    const avg = present.reduce((a, b) => a + b, 0) / present.length;
    return { name: g.name, publisher: g.publisher, genre: g.genre, avgRank: avg, daysPresent: present.length };
  })
  .sort((a, b) => a.avgRank - b.avgRank)
  .slice(0, 10);

// --- 6. Genre share (latest snapshot), folded to top N + "기타" ---
function genreLabel(g) { return g || '미분류'; }
const genreCountsLatest = new Map();
for (const row of latestSnap) {
  const key = genreLabel(row.genre);
  genreCountsLatest.set(key, (genreCountsLatest.get(key) || 0) + 1);
}
const genreSortedLatest = [...genreCountsLatest.entries()].sort((a, b) => b[1] - a[1]);
const topGenres = genreSortedLatest.slice(0, GENRE_FOLD_N).map(([name]) => name);
const genreShareLatest = (() => {
  const top = genreSortedLatest.slice(0, GENRE_FOLD_N).map(([name, count]) => ({ name, count }));
  const restCount = genreSortedLatest.slice(GENRE_FOLD_N).reduce((a, [, c]) => a + c, 0);
  if (restCount > 0) top.push({ name: '기타', count: restCount });
  return top;
})();

// --- 7. Genre trend over time (weekly-resampled stacked series), same fold set as latest ---
function weekKey(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const onejan = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d - onejan) / 86400000) + onejan.getUTCDay() + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
function genreTrendKey(genre) {
  const label = genreLabel(genre);
  if (label === '미분류') return '미분류'; // pre-genre-tracking era (first few days) -- a data-quality gap, not a real genre
  return topGenres.includes(label) ? label : '기타';
}
const weekBuckets = new Map(); // weekKey -> { label(lastDateInWeek), counts: Map(genre->count), samples }
dates.forEach((date, di) => {
  const wk = weekKey(date);
  if (!weekBuckets.has(wk)) weekBuckets.set(wk, { label: date, counts: new Map(), samples: 0 });
  const bucket = weekBuckets.get(wk);
  bucket.label = date; // keep advancing -> ends as the last date seen in that week
  bucket.samples += 1;
  for (const row of snapshots[di].rows) {
    const key = genreTrendKey(row.genre);
    bucket.counts.set(key, (bucket.counts.get(key) || 0) + 1);
  }
});
// Drop weeks from before genre tracking existed (any '미분류' presence) rather than
// plotting it as its own series -- keeps the trend chart at the 8-series ceiling
// and every retained week fully reliable.
const genreTrendWeeks = [...weekBuckets.entries()]
  .filter(([, b]) => !b.counts.has('미분류'))
  .sort(([a], [b]) => (a > b ? 1 : -1));
const genreTrendSeriesNames = [...new Set(genreShareLatest.map(g => g.name))];
const genreTrend = {
  labels: genreTrendWeeks.map(([, b]) => b.label),
  series: genreTrendSeriesNames.map(name => ({
    name,
    values: genreTrendWeeks.map(([, b]) => {
      const raw = b.counts.get(name) || 0;
      return Math.round((raw / b.samples) * 10) / 10; // average count per snapshot in that week
    }),
  })),
};

// --- 8. Publisher leaderboard (latest snapshot: concurrent titles in today's top 100) ---
const publisherMap = new Map();
for (const row of latestSnap) {
  if (!publisherMap.has(row.publisher)) publisherMap.set(row.publisher, { publisher: row.publisher, count: 0, bestRank: 999, titles: [] });
  const p = publisherMap.get(row.publisher);
  p.count += 1;
  p.bestRank = Math.min(p.bestRank, row.rank);
  p.titles.push({ name: row.name, rank: row.rank });
}
const publisherLeaderboard = [...publisherMap.values()]
  .sort((a, b) => b.count - a.count || a.bestRank - b.bestRank)
  .slice(0, PUBLISHER_TOP_N)
  .map(p => ({ ...p, titles: p.titles.sort((a, b) => a.rank - b.rank) }));

// --- 9. Rank trend: default top N games by current rank, full history ---
const trendGames = [...gameList]
  .filter(g => rankOf(g, latestIdx) != null)
  .sort((a, b) => a.ranks[latestIdx] - b.ranks[latestIdx])
  .slice(0, TREND_DEFAULT_N)
  .map(g => ({ name: g.name, publisher: g.publisher, genre: g.genre, ranks: g.ranks }));

// --- 10. Full detail table (latest snapshot) with change vs prev day + sparkline window ---
const SPARK_WINDOW = 30;
const sparkStart = Math.max(0, dates.length - SPARK_WINDOW);
const detailTable = latestSnap.map(row => {
  const g = games.get(row.name);
  const prevRank = idxPrevDay >= 0 ? rankOf(g, idxPrevDay) : null;
  const change = prevRank != null ? prevRank - row.rank : null;
  return {
    rank: row.rank,
    name: row.name,
    publisher: row.publisher,
    genre: genreLabel(row.genre),
    change,
    isNew: idxPrevDay >= 0 ? prevRank == null : false,
    spark: g.ranks.slice(sparkStart),
  };
});

// --- 11. Assemble + write ---
const data = {
  generatedAt: new Date().toISOString(),
  meta: {
    firstDate: dates[0],
    lastDate: dates[latestIdx],
    totalDays: dates.length,
    totalSnapshotsParsed: candidateFiles.length,
    uniqueGames: gameList.length,
    country: 'kr',
    collection: 'GROSSING (매출 순위)',
    topN: 100,
  },
  dates,
  sparkWindow: dates.slice(sparkStart),
  kpi: {
    currentNo1: latestSnap[0] ? { name: latestSnap[0].name, publisher: latestSnap[0].publisher, genre: genreLabel(latestSnap[0].genre) } : null,
    longestNo1: daysNo1[0] || null,
    topPublisher: publisherLeaderboard[0] || null,
    topGenre: genreShareLatest[0] || null,
  },
  notable: { topRisers, topFallers, newEntries, dropouts, comparedTo: idxPrevDay >= 0 ? dates[idxPrevDay] : null },
  steadiest,
  daysNo1,
  genreShareLatest,
  genreTrend,
  publisherLeaderboard,
  trendGames,
  detailTable,
};

if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });
const outPath = path.join(docsDir, 'data.js');
fs.writeFileSync(outPath, `window.PLAYSTORE_DATA = ${JSON.stringify(data)};\n`, 'utf-8');

console.log(`Parsed ${candidateFiles.length} snapshots -> ${dates.length} days (${dates[0]} ~ ${dates[latestIdx]}), ${gameList.length} unique games.`);
console.log(`Wrote ${outPath} (${(fs.statSync(outPath).size / 1024).toFixed(1)} KB)`);
