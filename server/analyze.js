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

function walk(dir, skipNames) {
  let results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skipNames && skipNames.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results = results.concat(walk(full, skipNames));
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
const NEW_RELEASE_DAYS = 90;

// --- 1. Pick one "closing" snapshot per calendar date (the latest run that day) ---
// 'intl' holds the separate international-market scrapes (see analyze-intl.js) and
// must never be swept into the KR dataset below.
const candidateFiles = walk(outputDir, new Set(['intl'])).filter(f => DATE_FOLDER_RE.test(path.basename(path.dirname(f))));

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
    const released = String(r['출시일'] || '').trim();
    const score = typeof r['평점'] === 'number' ? r['평점'] : null;
    const ratings = typeof r['평점수'] === 'number' ? r['평점수'] : null;
    const installsText = String(r['설치수'] || '').trim();
    const minInstalls = typeof r['최소설치'] === 'number' ? r['최소설치'] : null;
    const offersIAP = r['IAP여부'] === true;
    const iapRange = String(r['IAP가격대'] || '').trim();
    const adSupported = r['광고포함'] === true;
    const icon = String(r['아이콘'] || '').trim();
    const recentChanges = String(r['업데이트내용'] || '').trim();
    if (!name || !rank || category !== '게임') continue;
    if (!games.has(name)) {
      games.set(name, {
        name, publisher, genre, released: '', ranks: new Array(dates.length).fill(null),
        score: null, ratings: null, installsText: '', minInstalls: null, offersIAP: false, iapRange: '', adSupported: false, icon: '', recentChanges: '',
      });
    }
    const g = games.get(name);
    g.ranks[di] = rank;
    // keep the most recently seen label for anything that can drift over time
    if (publisher) g.publisher = publisher;
    if (genre) g.genre = genre;
    if (released) g.released = released;
    if (score != null) g.score = score;
    if (ratings != null) g.ratings = ratings;
    if (installsText) g.installsText = installsText;
    if (minInstalls != null) g.minInstalls = minInstalls;
    g.offersIAP = offersIAP;
    if (iapRange) g.iapRange = iapRange;
    g.adSupported = adSupported;
    if (icon) g.icon = icon;
    if (recentChanges) g.recentChanges = recentChanges;
    snap.push({ rank, name, publisher, genre, released, score, ratings, installsText, minInstalls, offersIAP, iapRange, adSupported, icon, recentChanges });
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
  .map(g => ({ name: g.name, publisher: g.publisher, genre: g.genre, rank: g.ranks[latestIdx], change: g.ranks[idxPrevDay] - g.ranks[latestIdx], recentChanges: g.recentChanges || '' }))
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

// --- 8b. Quality & monetization benchmark (latest snapshot, Top100-wide) ---
function benchmarkOf(rows) {
  const scored = rows.map(r => games.get(r.name)).filter(g => g && g.score != null);
  const n = rows.length || 1;
  const iapCount = rows.filter(r => games.get(r.name) && games.get(r.name).offersIAP).length;
  const adCount = rows.filter(r => games.get(r.name) && games.get(r.name).adSupported).length;
  const freeNoAdsNoIap = rows.filter(r => {
    const g = games.get(r.name);
    return g && !g.offersIAP && !g.adSupported;
  }).length;
  return {
    sampleSize: rows.length,
    avgScore: scored.length ? Math.round((scored.reduce((s, g) => s + g.score, 0) / scored.length) * 100) / 100 : null,
    scoreSampleSize: scored.length,
    iapPct: Math.round((iapCount / n) * 1000) / 10,
    adSupportedPct: Math.round((adCount / n) * 1000) / 10,
    noMonetizationCount: freeNoAdsNoIap,
  };
}
const qualityBenchmark = benchmarkOf(latestSnap);

// --- 9. Rank trend: default top N games by current rank, full history ---
const trendGames = [...gameList]
  .filter(g => rankOf(g, latestIdx) != null)
  .sort((a, b) => a.ranks[latestIdx] - b.ranks[latestIdx])
  .slice(0, TREND_DEFAULT_N)
  .map(g => ({ name: g.name, publisher: g.publisher, genre: g.genre, ranks: g.ranks }));

// --- 10. Full detail table (latest snapshot) with change vs prev day + sparkline window ---
const SPARK_WINDOW = 30;
const sparkStart = Math.max(0, dates.length - SPARK_WINDOW);
const latestDate = new Date(dates[latestIdx] + 'T00:00:00Z');
const detailTable = latestSnap.map(row => {
  const g = games.get(row.name);
  const prevRank = idxPrevDay >= 0 ? rankOf(g, idxPrevDay) : null;
  const change = prevRank != null ? prevRank - row.rank : null;
  const releasedDate = parseReleased(row.released || g.released);
  const daysSinceRelease = releasedDate ? Math.round((latestDate - releasedDate) / 86400000) : null;
  return {
    rank: row.rank,
    name: row.name,
    publisher: row.publisher,
    genre: genreLabel(row.genre),
    change,
    isNew: idxPrevDay >= 0 ? prevRank == null : false,
    released: row.released || g.released || '',
    daysSinceRelease,
    isNewRelease: daysSinceRelease != null && daysSinceRelease >= 0 && daysSinceRelease <= NEW_RELEASE_DAYS,
    score: g.score,
    ratings: g.ratings,
    installsText: g.installsText,
    offersIAP: g.offersIAP,
    iapRange: g.iapRange,
    adSupported: g.adSupported,
    icon: g.icon,
    spark: g.ranks.slice(sparkStart),
  };
});
const newReleases = detailTable
  .filter(r => r.isNewRelease)
  .sort((a, b) => a.daysSinceRelease - b.daysSinceRelease);

// --- 12. Per-genre detail dataset (drives docs/genre.html) ---
// Unlike genreShareLatest/genreTrend (folded to a fixed 7+"기타" for the stacked
// chart's color budget), this covers every genre that has ever appeared -- a
// reader drilling into one genre isn't limited by how many colors a chart can hold.
const genreFirstTrackedIdx = dates.findIndex((d, i) => snapshots[i].rows.some(r => r.genre));
const genreTrackedDates = genreFirstTrackedIdx >= 0 ? dates.slice(genreFirstTrackedIdx) : [];
const distinctGenres = [...new Set(gameList.map(g => g.genre).filter(Boolean))].sort();

const genreDetail = {};
distinctGenres.forEach(genreName => {
  const genreGames = gameList.filter(g => g.genre === genreName);

  // Daily share of Top100 (%) across the whole genre-tracked window -- a single
  // line covering every day genre data exists, not the main page's 9-week
  // resample (that one only exists to keep 8 stacked series legible at once).
  const dailyShare = genreTrackedDates.map((date, i) => {
    const di = genreFirstTrackedIdx + i;
    return snapshots[di].rows.filter(r => r.genre === genreName).length;
  });

  // Concentration: of all "genre-days" ever logged for this genre, what share
  // belongs to its 3 most-persistent games. An HHI-style dominance read, not a
  // same-day rank cutoff (which would always read 3/N regardless of dominance).
  const byPresence = [...genreGames].sort((a, b) => b.ranks.filter(r => r != null).length - a.ranks.filter(r => r != null).length);
  const totalGenreDays = byPresence.reduce((sum, g) => sum + g.ranks.filter(r => r != null).length, 0);
  const top3Days = byPresence.slice(0, 3).reduce((sum, g) => sum + g.ranks.filter(r => r != null).length, 0);
  const concentrationPct = totalGenreDays > 0 ? Math.round((top3Days / totalGenreDays) * 1000) / 10 : 0;

  // Every game ever seen in this genre, not just today's Top100.
  const gamesOut = genreGames.map(g => {
    const present = g.ranks.filter(r => r != null);
    const avgRank = present.length ? present.reduce((a, b) => a + b, 0) / present.length : null;
    const currentRank = rankOf(g, latestIdx);
    const releasedDate = parseReleased(g.released);
    const daysSinceRelease = releasedDate ? Math.round((latestDate - releasedDate) / 86400000) : null;
    return {
      name: g.name,
      publisher: g.publisher,
      currentRank,
      avgRank,
      daysPresent: present.length,
      released: g.released || '',
      daysSinceRelease,
      isNewRelease: daysSinceRelease != null && daysSinceRelease >= 0 && daysSinceRelease <= NEW_RELEASE_DAYS,
      score: g.score,
      installsText: g.installsText,
      offersIAP: g.offersIAP,
      adSupported: g.adSupported,
      icon: g.icon,
    };
  }).sort((a, b) => {
    if (a.currentRank != null && b.currentRank != null) return a.currentRank - b.currentRank;
    if (a.currentRank != null) return -1;
    if (b.currentRank != null) return 1;
    return a.avgRank - b.avgRank;
  });
  const currentlyCharting = gamesOut.filter(g => g.currentRank != null);

  // Publishers within this genre, by distinct game count (all-time).
  const pubMap = new Map();
  genreGames.forEach(g => {
    if (!pubMap.has(g.publisher)) pubMap.set(g.publisher, { publisher: g.publisher, gameCount: 0, currentlyCharting: 0 });
    const p = pubMap.get(g.publisher);
    p.gameCount += 1;
    if (rankOf(g, latestIdx) != null) p.currentlyCharting += 1;
  });
  const publishers = [...pubMap.values()].sort((a, b) => b.gameCount - a.gameCount || b.currentlyCharting - a.currentlyCharting);

  genreDetail[genreName] = {
    name: genreName,
    datesTracked: genreTrackedDates,
    dailyShare,
    today: {
      count: currentlyCharting.length,
      avgRank: currentlyCharting.length ? Math.round((currentlyCharting.reduce((s, g) => s + g.currentRank, 0) / currentlyCharting.length) * 10) / 10 : null,
    },
    concentration: { pct: concentrationPct, top3: byPresence.slice(0, 3).map(g => ({ name: g.name, daysPresent: g.ranks.filter(r => r != null).length })) },
    totalGamesEver: genreGames.length,
    games: gamesOut,
    publishers,
    newReleases: gamesOut.filter(g => g.isNewRelease).sort((a, b) => a.daysSinceRelease - b.daysSinceRelease),
    benchmark: benchmarkOf(genreGames.filter(g => rankOf(g, latestIdx) != null)),
    moodboard: currentlyCharting.filter(g => g.icon).slice(0, 12).map(g => ({ name: g.name, icon: g.icon, currentRank: g.currentRank })),
  };
});

const genreDetailOut = {
  generatedAt: new Date().toISOString(),
  lastDate: dates[latestIdx],
  genreList: distinctGenres.map(name => ({ name, count: genreDetail[name].today.count })).sort((a, b) => b.count - a.count),
  genres: genreDetail,
};

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
    newReleaseCount: newReleases.length,
  },
  notable: { topRisers, topFallers, newEntries, dropouts, comparedTo: idxPrevDay >= 0 ? dates[idxPrevDay] : null },
  steadiest,
  daysNo1,
  genreShareLatest,
  genreTrend,
  publisherLeaderboard,
  trendGames,
  newReleaseWindowDays: NEW_RELEASE_DAYS,
  newReleases,
  qualityBenchmark,
  detailTable,
};

if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });
const outPath = path.join(docsDir, 'data.js');
fs.writeFileSync(outPath, `window.PLAYSTORE_DATA = ${JSON.stringify(data)};\n`, 'utf-8');

const genreOutPath = path.join(docsDir, 'genre-data.js');
fs.writeFileSync(genreOutPath, `window.GENRE_DATA = ${JSON.stringify(genreDetailOut)};\n`, 'utf-8');

console.log(`Parsed ${candidateFiles.length} snapshots -> ${dates.length} days (${dates[0]} ~ ${dates[latestIdx]}), ${gameList.length} unique games.`);
console.log(`Wrote ${outPath} (${(fs.statSync(outPath).size / 1024).toFixed(1)} KB)`);
console.log(`Wrote ${genreOutPath} (${(fs.statSync(genreOutPath).size / 1024).toFixed(1)} KB) -- ${distinctGenres.length} genres`);
