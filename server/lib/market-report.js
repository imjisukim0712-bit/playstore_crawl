// Builds one market's report dataset (the per-market counterpart of what
// analyze.js builds for KR) plus its opportunity-map dataset, from that
// market's dated snapshot folder. Games are keyed by appId, not by name, so a
// title that changes language or wording between snapshots stays one game.
//
// Used by analyze-intl.js (every international market -> docs/markets/<code>.js
// + <code>-opp.js) and analyze.js (KR -> docs/markets/kr-opp.js for genre.html).

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const C = require('./classify');

const DATE_FOLDER_RE = /^\d{6}$/; // YYMMDD
const FILENAME_RE = /^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})$/;
const TOP_MOVERS_N = 8;
const TREND_DEFAULT_N = 8;
const GENRE_FOLD_N = 7;
const PUBLISHER_TOP_N = 15;
const SPARK_WINDOW = 30;
const NEW_RELEASE_DAYS = 90;
const DAILY_GENRE_TREND_MAX_DAYS = 45; // beyond this, resample weekly like analyze.js
const OPPORTUNITY_WINDOW_DAYS = 7;

function walk(dir, skipNames) {
  if (!fs.existsSync(dir)) return [];
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
  const m = path.basename(filePath, '.xlsx').match(FILENAME_RE);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  return { date: `${y}-${mo}-${d}`, ms: Date.UTC(+y, +mo - 1, +d, +h, +mi, +s) };
}

function num(v) { return typeof v === 'number' ? v : null; }
function str(v) { return String(v == null ? '' : v).trim(); }

function normalizeRow(r) {
  const genreId = str(r['장르ID']);
  const genreText = str(r['세부 카테고리']);
  return {
    rank: Number(r['순위']),
    name: str(r['앱 이름']),
    publisher: str(r['퍼블리셔']) || 'Unknown',
    category: str(r['카테고리']),
    genreId,
    genre: C.genreLabelOf(genreId, genreText),
    appId: str(r['앱ID']),
    released: str(r['출시일']),
    score: num(r['평점']),
    ratings: num(r['평점수']),
    installsText: str(r['설치수']),
    minInstalls: num(r['최소설치']),
    price: num(r['가격']) || 0,
    offersIAP: r['IAP여부'] === true,
    iapRange: str(r['IAP가격대']),
    adSupported: r['광고포함'] === true,
    icon: str(r['아이콘']),
    recentChanges: str(r['업데이트내용']),
    subGenre: str(r['세부장르']),
    tags: str(r['태그']).split(',').map(t => t.trim()).filter(Boolean),
    hasTagColumn: Object.prototype.hasOwnProperty.call(r, '태그'),
    contentRating: str(r['연령등급']),
    summary: str(r['요약']),
    desc: str(r['설명']),
  };
}

// One closing snapshot per calendar date (the latest run that day).
function loadSnapshots(dir, skipNames) {
  const files = walk(dir, skipNames).filter(f => DATE_FOLDER_RE.test(path.basename(path.dirname(f))));
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
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]])
      .map(normalizeRow)
      .filter(r => r.name && r.rank && (!r.category || r.category === '게임'))
      .sort((a, b) => a.rank - b.rank);
  });
  return { dates, snapshots, fileCount: files.length };
}

function round1(v) { return Math.round(v * 10) / 10; }
function round2(v) { return Math.round(v * 100) / 100; }

// market: { code, label, flag, country, metric, metricLabel, note }
// dir/skipNames: where this market's dated snapshot folders live.
function buildMarket(market, dir, skipNames) {
  const { dates, snapshots, fileCount } = loadSnapshots(dir, skipNames);
  if (dates.length === 0) return null;

  // Stable identity: appId when known. Rows from before appId was collected
  // borrow it from any later row with the same name.
  const nameToAppId = new Map();
  snapshots.forEach(snap => snap.forEach(r => { if (r.appId) nameToAppId.set(r.name, r.appId); }));
  const keyOf = r => r.appId || nameToAppId.get(r.name) || `name:${r.name}`;

  const games = new Map();
  snapshots.forEach((snap, di) => {
    snap.forEach(r => {
      const key = keyOf(r);
      if (!games.has(key)) games.set(key, { key, ranks: new Array(dates.length).fill(null), tags: [] });
      const g = games.get(key);
      g.ranks[di] = r.rank;
      // keep the most recently seen value for anything that can drift over time
      for (const f of ['name', 'publisher', 'genreId', 'genre', 'appId', 'released', 'installsText', 'iapRange', 'icon', 'recentChanges', 'subGenre', 'contentRating', 'summary', 'desc']) {
        if (r[f]) g[f] = r[f];
      }
      for (const f of ['score', 'ratings', 'minInstalls']) if (r[f] != null) g[f] = r[f];
      g.price = r.price;
      g.offersIAP = r.offersIAP;
      g.adSupported = r.adSupported;
      if (r.hasTagColumn) g.tags = r.tags;
    });
  });
  const gameList = [...games.values()];
  const latestIdx = dates.length - 1;
  const idxPrevDay = latestIdx > 0 ? latestIdx - 1 : -1;
  const latestDate = new Date(dates[latestIdx] + 'T00:00:00Z');
  const rankOf = (g, idx) => (idx >= 0 ? g.ranks[idx] : null);
  const latestSnap = snapshots[latestIdx].map(r => games.get(keyOf(r)));

  gameList.forEach(g => {
    const rel = C.parseReleased(g.released);
    g.daysSinceRelease = rel ? Math.round((latestDate - rel) / 86400000) : null;
    g.isNewRelease = g.daysSinceRelease != null && g.daysSinceRelease >= 0 && g.daysSinceRelease <= NEW_RELEASE_DAYS;
  });
  const ref = g => ({ name: g.name, publisher: g.publisher, genre: g.genre, appId: g.appId || '', icon: g.icon || '' });

  // --- notable changes vs previous day ---
  const movers = gameList
    .filter(g => rankOf(g, latestIdx) != null && rankOf(g, idxPrevDay) != null)
    .map(g => ({ ...ref(g), rank: g.ranks[latestIdx], change: g.ranks[idxPrevDay] - g.ranks[latestIdx], recentChanges: g.recentChanges || '' }))
    .filter(m => m.change !== 0);
  const topRisers = [...movers].sort((a, b) => b.change - a.change).slice(0, TOP_MOVERS_N);
  const topFallers = [...movers].sort((a, b) => a.change - b.change).slice(0, TOP_MOVERS_N);
  const newEntries = idxPrevDay >= 0
    ? gameList.filter(g => rankOf(g, latestIdx) != null && rankOf(g, idxPrevDay) == null)
        .map(g => ({ ...ref(g), rank: g.ranks[latestIdx] })).sort((a, b) => a.rank - b.rank).slice(0, TOP_MOVERS_N)
    : [];
  const dropouts = idxPrevDay >= 0
    ? gameList.filter(g => rankOf(g, latestIdx) == null && rankOf(g, idxPrevDay) != null)
        .map(g => ({ ...ref(g), rank: g.ranks[idxPrevDay] })).sort((a, b) => a.rank - b.rank).slice(0, TOP_MOVERS_N)
    : [];

  // --- longest #1, steadiest ---
  const daysNo1 = gameList
    .map(g => ({ ...ref(g), days: g.ranks.filter(r => r === 1).length }))
    .filter(g => g.days > 0)
    .sort((a, b) => b.days - a.days)
    .slice(0, 5);
  const presenceThreshold = Math.max(1, Math.round(dates.length * 0.8));
  const steadiest = gameList
    .filter(g => g.ranks.filter(r => r != null).length >= presenceThreshold)
    .map(g => {
      const present = g.ranks.filter(r => r != null);
      return { ...ref(g), avgRank: present.reduce((a, b) => a + b, 0) / present.length, daysPresent: present.length };
    })
    .sort((a, b) => a.avgRank - b.avgRank)
    .slice(0, 10);

  // --- genre share today (folded) + trend ---
  const genreCounts = new Map();
  latestSnap.forEach(g => genreCounts.set(g.genre, (genreCounts.get(g.genre) || 0) + 1));
  const genreSorted = [...genreCounts.entries()].sort((a, b) => b[1] - a[1]);
  const topGenres = genreSorted.slice(0, GENRE_FOLD_N).map(([name]) => name);
  const latestTotal = latestSnap.length || 1;
  const genreShareLatest = genreSorted.slice(0, GENRE_FOLD_N).map(([name, count]) => ({ name, count, pct: round1(count / latestTotal * 100) }));
  const restCount = genreSorted.slice(GENRE_FOLD_N).reduce((a, [, c]) => a + c, 0);
  if (restCount > 0) genreShareLatest.push({ name: '기타', count: restCount, pct: round1(restCount / latestTotal * 100) });

  const daily = dates.length <= DAILY_GENRE_TREND_MAX_DAYS;
  const bucketKey = date => {
    if (daily) return date;
    const d = new Date(date + 'T00:00:00Z');
    const onejan = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return `${d.getUTCFullYear()}-W${String(Math.ceil((((d - onejan) / 86400000) + onejan.getUTCDay() + 1) / 7)).padStart(2, '0')}`;
  };
  const buckets = new Map();
  dates.forEach((date, di) => {
    const k = bucketKey(date);
    if (!buckets.has(k)) buckets.set(k, { label: date, counts: new Map(), total: 0 });
    const b = buckets.get(k);
    b.label = date;
    snapshots[di].forEach(r => {
      const name = topGenres.includes(r.genre) ? r.genre : '기타';
      b.counts.set(name, (b.counts.get(name) || 0) + 1);
      b.total += 1;
    });
  });
  const bucketList = [...buckets.values()];
  const genreTrend = {
    granularity: daily ? 'daily' : 'weekly',
    labels: bucketList.map(b => b.label),
    series: genreShareLatest.map(gs => ({
      name: gs.name,
      values: bucketList.map(b => round1(((b.counts.get(gs.name) || 0) / (b.total || 1)) * 100)),
    })),
  };

  // --- publishers today ---
  const pubMap = new Map();
  latestSnap.forEach(g => {
    const rank = g.ranks[latestIdx];
    if (!pubMap.has(g.publisher)) pubMap.set(g.publisher, { publisher: g.publisher, count: 0, bestRank: 999, titles: [] });
    const p = pubMap.get(g.publisher);
    p.count += 1;
    p.bestRank = Math.min(p.bestRank, rank);
    p.titles.push({ name: g.name, rank });
  });
  const publisherLeaderboard = [...pubMap.values()]
    .sort((a, b) => b.count - a.count || a.bestRank - b.bestRank)
    .slice(0, PUBLISHER_TOP_N)
    .map(p => ({ ...p, titles: p.titles.sort((a, b) => a.rank - b.rank) }));

  // --- quality & monetization benchmark (today) ---
  const scored = latestSnap.filter(g => g.score != null);
  const qualityBenchmark = {
    sampleSize: latestSnap.length,
    avgScore: scored.length ? round2(scored.reduce((s, g) => s + g.score, 0) / scored.length) : null,
    scoreSampleSize: scored.length,
    iapPct: round1(latestSnap.filter(g => g.offersIAP).length / latestTotal * 100),
    adSupportedPct: round1(latestSnap.filter(g => g.adSupported).length / latestTotal * 100),
    noMonetizationCount: latestSnap.filter(g => !g.offersIAP && !g.adSupported).length,
  };

  // --- rank trend: today's top N, full history ---
  const trendGames = latestSnap.slice(0, TREND_DEFAULT_N).map(g => ({ ...ref(g), ranks: g.ranks }));

  // --- detail table (today) ---
  const sparkStart = Math.max(0, dates.length - SPARK_WINDOW);
  const detailTable = latestSnap.map(g => {
    const rank = g.ranks[latestIdx];
    const prevRank = rankOf(g, idxPrevDay);
    return {
      ...ref(g),
      rank,
      change: prevRank != null ? prevRank - rank : null,
      isNew: idxPrevDay >= 0 ? prevRank == null : false,
      released: g.released || '',
      daysSinceRelease: g.daysSinceRelease,
      isNewRelease: g.isNewRelease,
      score: g.score,
      installsText: g.installsText || '',
      spark: g.ranks.slice(sparkStart),
    };
  });
  const newReleases = detailTable.filter(r => r.isNewRelease).sort((a, b) => a.daysSinceRelease - b.daysSinceRelease);

  const report = {
    generatedAt: new Date().toISOString(),
    market: { code: market.code, label: market.label, flag: market.flag, country: market.country || market.code, metric: market.metric, metricLabel: market.metricLabel, note: market.note || null },
    meta: {
      firstDate: dates[0],
      lastDate: dates[latestIdx],
      totalDays: dates.length,
      totalSnapshotsParsed: fileCount,
      uniqueGames: gameList.length,
      topN: latestSnap.length,
    },
    dates,
    kpi: {
      currentNo1: latestSnap[0] ? ref(latestSnap[0]) : null,
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

  return { report, opportunity: buildOpportunity(market, dates, snapshots, games, keyOf) };
}

// --- Opportunity map dataset ---
// Every game that charted in the last OPPORTUNITY_WINDOW_DAYS, with its share
// of the window's estimated revenue (rank-weighted, averaged across the days,
// 0 on days it was off-chart) and its design-dimension classification.
function buildOpportunity(market, dates, snapshots, games, keyOf) {
  const start = Math.max(0, dates.length - OPPORTUNITY_WINDOW_DAYS);
  const windowIdx = dates.map((_, i) => i).slice(start);
  const weightSum = new Map();
  windowIdx.forEach(di => snapshots[di].forEach(r => {
    const k = keyOf(r);
    weightSum.set(k, (weightSum.get(k) || 0) + C.rankWeight(r.rank));
  }));
  const total = [...weightSum.values()].reduce((a, b) => a + b, 0) || 1;
  const latestIdx = dates.length - 1;

  const out = [...weightSum.entries()].map(([k, w]) => {
    const g = games.get(k);
    const inWindow = windowIdx.map(di => g.ranks[di]).filter(r => r != null);
    const { dims, iapMaxUsd } = C.classifyGame({
      genreId: g.genreId, title: g.name, summary: g.summary, desc: g.desc, subGenre: g.subGenre,
      tags: g.tags, offersIAP: g.offersIAP, adSupported: g.adSupported, price: g.price,
      iapRange: g.iapRange, contentRating: g.contentRating, daysSinceRelease: g.daysSinceRelease,
    }, market.code);
    return {
      name: g.name,
      appId: g.appId || '',
      icon: g.icon || '',
      publisher: g.publisher,
      genre: g.genre,
      rank: g.ranks[latestIdx],
      bestRank: Math.min(...inWindow),
      daysInWindow: inWindow.length,
      share: round2(w / total * 100),
      released: g.released || '',
      daysSinceRelease: g.daysSinceRelease,
      iapRange: g.iapRange || '',
      iapMaxUsd,
      contentRating: g.contentRating || '',
      tags: g.tags,
      dims,
    };
  }).sort((a, b) => b.share - a.share);

  const withTags = out.filter(g => g.tags.length > 0).length;
  return {
    generatedAt: new Date().toISOString(),
    market: { code: market.code, label: market.label, flag: market.flag, country: market.country || market.code, metric: market.metric },
    window: { days: windowIdx.length, from: dates[start], to: dates[latestIdx] },
    shareLabel: market.metric === 'GROSSING' ? '추정 매출 비중' : '추정 인기 비중',
    weightExponent: C.RANK_WEIGHT_EXPONENT,
    tagCoverage: { withTags, total: out.length },
    unclassified: C.UNCLASSIFIED,
    dimensions: C.DIMENSIONS,
    games: out,
  };
}

function writeWindowVar(filePath, varName, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `window.${varName} = ${JSON.stringify(data)};\n`, 'utf-8');
  return fs.statSync(filePath).size;
}

module.exports = { buildMarket, writeWindowVar };
