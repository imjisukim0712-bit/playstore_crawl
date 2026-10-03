const gplay = require('google-play-scraper');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const outputDir = path.join(__dirname, 'output');
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

function timestamp() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '_',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');
}

function dateDir() {
  const now = new Date();
  return [
    String(now.getFullYear()).slice(2),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('');
}

function stripHtml(s) {
  return String(s || '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
}

// Sub-genre tag, read off the store listing's own words (title/summary/description)
// rather than guessed -- so it's traceable and stays accurate as the catalog changes.
// Coverage is intentionally partial: a game whose listing doesn't use any of these
// words is left '' (미분류) rather than forced into a guessed bucket.
function classifySubGenre(title, summary, description) {
  const title_ = title || '';
  const rest = `${summary || ''} ${(description || '').slice(0, 500)}`;
  if (/키우기|방치형/.test(title_) || /방치형/.test(rest)) return '방치형';
  if (/MMORPG/i.test(title_ + ' ' + rest)) return 'MMORPG';
  if (/수집형|가챠/.test(title_ + ' ' + rest)) return '수집형·서브컬처';
  return '';
}

// GitHub Actions turns `::warning::` / `::error::` stdout lines into run annotations.
function ciNote(level, msg) {
  if (process.env.GITHUB_ACTIONS === 'true') console.log(`::${level}::${msg}`);
  else (level === 'error' ? console.error : console.warn)(`[${level}] ${msg}`);
}

const LIST_ATTEMPTS = 3;
const DETAIL_ATTEMPTS = 2;
const DETAIL_CONCURRENCY = 8;
// More fallbacks than this means the store itself is misbehaving -- fail the
// market rather than save a chart that is mostly missing its details.
const MAX_FALLBACK_SHARE = 0.2;

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function withRetry(label, attempts, fn) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts) {
        console.warn(`  ${label}: attempt ${i} failed (${err.message}), retrying`);
        await sleep(3000 * i);
      }
    }
  }
  throw lastErr;
}

// Fetches the chart, then each game's detail page on its own. The library's
// fullDetail mode loads all 100 detail pages with Promise.all, so one listing
// it can't parse used to throw away the whole market (GB/IN/RU on 2026-10-02).
// Here a game whose detail page keeps failing keeps its chart entry (title,
// developer, icon, score) and the rest of the market is saved as usual.
async function fetchChart(collection, category, country, lang) {
  const params = { collection, num: 100, country, lang };
  if (category) params.category = category;
  const entries = await withRetry('chart list', LIST_ATTEMPTS, () => gplay.list(params));
  if (!entries.length) throw new Error('chart came back empty');

  const details = new Array(entries.length);
  const fallbacks = [];
  let next = 0;
  async function worker() {
    while (next < entries.length) {
      const i = next++;
      const entry = entries[i];
      try {
        details[i] = await withRetry(entry.appId, DETAIL_ATTEMPTS, () => gplay.app({ appId: entry.appId, country, lang }));
      } catch (err) {
        details[i] = entry;
        fallbacks.push(`#${i + 1} ${entry.title} (${entry.appId}): ${err.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: DETAIL_CONCURRENCY }, worker));

  if (fallbacks.length > entries.length * MAX_FALLBACK_SHARE) {
    throw new Error(`detail pages failed for ${fallbacks.length}/${entries.length} games, e.g. ${fallbacks[0]}`);
  }
  fallbacks.forEach(f => ciNote('warning', `[${country}] detail page unavailable, saved chart entry only: ${f}`));
  return details;
}

async function scrapeRankings(collection, category, opts) {
  opts = opts || {};
  const country = opts.country || 'kr';
  const lang = opts.lang || 'ko';
  const apps = await fetchChart(collection, category, country, lang);
  const label = category ? '게임' : '일반';
  return apps.map((app, index) => ({
    rank: index + 1,
    name: app.title,
    publisher: app.developer || app.developerId || 'Unknown',
    category: label,
    subCategory: app.genre || '',
    genreId: app.genreId || '',
    appId: app.appId || '',
    released: app.released || '',
    score: typeof app.score === 'number' ? app.score : null,
    ratings: typeof app.ratings === 'number' ? app.ratings : null,
    reviews: typeof app.reviews === 'number' ? app.reviews : null,
    histogram: app.histogram || null,
    installsText: app.installs || '',
    minInstalls: typeof app.minInstalls === 'number' ? app.minInstalls : null,
    price: typeof app.price === 'number' ? app.price : null,
    offersIAP: !!app.offersIAP,
    iapRange: app.IAPRange || '',
    adSupported: !!app.adSupported,
    icon: app.icon || '',
    recentChanges: stripHtml(app.recentChanges),
    subGenre: classifySubGenre(app.title, app.summary, app.description),
    // Google Play's own listing tags (art style, setting, player mode, sub-genre...).
    // The entries with an id are the Play genre itself; the id-less ones are the tags.
    tags: (app.categories || []).filter(c => c && !c.id && c.name).map(c => c.name),
    contentRating: app.contentRating || '',
    summary: stripHtml(app.summary),
    // Only the opening pitch -- enough for the classifier's keyword fallback on
    // listings that carry no Play tags, without bloating every daily snapshot.
    descriptionHead: stripHtml(app.description).slice(0, 200),
  }));
}

function toRow(r) {
  return {
    순위: r.rank,
    '앱 이름': r.name,
    퍼블리셔: r.publisher,
    카테고리: r.category,
    '세부 카테고리': r.subCategory,
    세부장르: r.subGenre,
    장르ID: r.genreId,
    앱ID: r.appId,
    출시일: r.released,
    평점: r.score,
    평점수: r.ratings,
    리뷰수: r.reviews,
    평점분포: r.histogram ? JSON.stringify(r.histogram) : '',
    설치수: r.installsText,
    최소설치: r.minInstalls,
    가격: r.price,
    IAP여부: r.offersIAP,
    IAP가격대: r.iapRange,
    광고포함: r.adSupported,
    아이콘: r.icon,
    업데이트내용: r.recentChanges,
    태그: (r.tags || []).join(', '),
    연령등급: r.contentRating,
    요약: r.summary,
    설명: r.descriptionHead,
  };
}

const COL_WIDTHS = [
  { wch: 6 }, { wch: 40 }, { wch: 30 }, { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 20 }, { wch: 34 }, { wch: 12 },
  { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 24 }, { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 8 },
  { wch: 26 }, { wch: 8 }, { wch: 50 }, { wch: 50 }, { wch: 40 }, { wch: 12 }, { wch: 50 }, { wch: 60 },
];

async function saveJSON(collection, category, typeLabel, opts) {
  console.log(`\nScraping ${typeLabel}...`);
  const rankings = await scrapeRankings(collection, category, opts);
  const subDir = (opts && opts.subDir) || path.join(outputDir, dateDir());
  if (!fs.existsSync(subDir)) fs.mkdirSync(subDir, { recursive: true });
  const fileName = `${timestamp()}.json`;
  const filePath = path.join(subDir, fileName);
  fs.writeFileSync(filePath, JSON.stringify({ timestamp: Date.now(), data: rankings }, null, 2), 'utf-8');
  console.log(`Saved: ${fileName} (${rankings.length} items)`);
  return filePath;
}

async function saveExcel(collection, category, typeLabel, opts) {
  console.log(`\nScraping ${typeLabel}...`);
  const rankings = await scrapeRankings(collection, category, opts);
  const data = rankings.map(toRow);
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '매출순위');
  ws['!cols'] = COL_WIDTHS;
  const subDir = (opts && opts.subDir) || path.join(outputDir, dateDir());
  if (!fs.existsSync(subDir)) fs.mkdirSync(subDir, { recursive: true });
  const fileName = `${timestamp()}.xlsx`;
  const filePath = path.join(subDir, fileName);
  XLSX.writeFile(wb, filePath);
  console.log(`Saved: ${fileName} (${rankings.length} items)`);
  return filePath;
}

// --- International markets (revenue-chart comparison) ---
// Russia has no usable GROSSING chart: Google Play billing (paid transactions)
// has been unavailable there since 2022, so the scraper's response for that
// collection carries no games cluster at all. TOP_FREE (popularity) is tracked
// there instead, and clearly labeled as a different metric from the other markets.
//
// Every market is fetched with lang 'ko': the chart order depends only on
// `country` (verified identical for en vs ko), while the Korean locale gives
// Korean titles where the developer localized them and -- more importantly --
// Play's listing tags in one vocabulary across all markets, which the
// opportunity-map classifier (lib/classify.js) relies on.
const INTL_MARKETS = [
  { code: 'us', country: 'us', lang: 'ko', label: '미국', collection: 'GROSSING' },
  { code: 'gb', country: 'gb', lang: 'ko', label: '영국', collection: 'GROSSING' },
  { code: 'in', country: 'in', lang: 'ko', label: '인도', collection: 'GROSSING' },
  { code: 'id', country: 'id', lang: 'ko', label: '인도네시아', collection: 'GROSSING' },
  { code: 'jp', country: 'jp', lang: 'ko', label: '일본', collection: 'GROSSING' },
  { code: 'ru', country: 'ru', lang: 'ko', label: '러시아', collection: 'TOP_FREE' },
];

async function saveExcelIntl(market) {
  const collection = gplay.collection[market.collection];
  const subDir = path.join(outputDir, 'intl', market.code, dateDir());
  return saveExcel(collection, gplay.category.GAME, `${market.label} 게임 (${market.collection})`, {
    country: market.country,
    lang: market.lang,
    subDir,
  });
}

function showMenu() {
  console.log(`\n  ===== Play Store Scraper =====`);
  console.log(`  output folder: ${outputDir}`);
  console.log(`  ─────────────────────────────`);
  console.log(`   1. 전체 앱 매출 순위 (JSON)`);
  console.log(`   2. 게임 매출 순위 (JSON)`);
  console.log(`   3. 전체 앱 매출 순위 (Excel)`);
  console.log(`   4. 게임 매출 순위 (Excel)`);
  console.log(`   5. 종료`);
  console.log(`  ─────────────────────────────`);
}

async function handleMenu(choice) {
  switch (choice.trim()) {
    case '1':
      await saveJSON(gplay.collection.GROSSING, null, '전체 앱');
      return true;
    case '2':
      await saveJSON(gplay.collection.GROSSING, gplay.category.GAME, '게임');
      return true;
    case '3':
      await saveExcel(gplay.collection.GROSSING, null, '전체 앱');
      return true;
    case '4':
      await saveExcel(gplay.collection.GROSSING, gplay.category.GAME, '게임');
      return true;
    case '5':
      console.log('종료합니다.');
      return false;
    default:
      console.log('잘못된 입력입니다. 1~5를 입력하세요.');
      return true;
  }
}

// --- Web Server Mode ---
function startServer() {
  const express = require('express');
  const cors = require('cors');
  const app = express();
  const PORT = process.env.PORT || 3001;
  app.use(cors());
  app.use(express.json());

  app.get('/api/rankings', async (req, res) => {
    try {
      const rankings = await scrapeRankings(gplay.collection.GROSSING);
      res.json({ success: true, timestamp: Date.now(), data: rankings });
    } catch (err) {
      res.status(502).json({ success: false, error: err.message });
    }
  });

  app.get('/api/rankings/excel', async (req, res) => {
    try {
      const rankings = await scrapeRankings(gplay.collection.GROSSING);
      const data = rankings.map(toRow);
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '매출순위');
      ws['!cols'] = COL_WIDTHS;
      const fileName = `${timestamp()}.xlsx`;
      const filePath = path.join(outputDir, fileName);
      XLSX.writeFile(wb, filePath);
      res.download(filePath, fileName);
    } catch (err) {
      res.status(502).json({ success: false, error: err.message });
    }
  });

  app.get('/api/rankings/games', async (req, res) => {
    try {
      const rankings = await scrapeRankings(gplay.collection.GROSSING, gplay.category.GAME);
      res.json({ success: true, timestamp: Date.now(), data: rankings });
    } catch (err) {
      res.status(502).json({ success: false, error: err.message });
    }
  });

  app.get('/api/rankings/games/excel', async (req, res) => {
    try {
      const rankings = await scrapeRankings(gplay.collection.GROSSING, gplay.category.GAME);
      const data = rankings.map(toRow);
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '매출순위');
      ws['!cols'] = COL_WIDTHS;
      const fileName = `${timestamp()}.xlsx`;
      const filePath = path.join(outputDir, fileName);
      XLSX.writeFile(wb, filePath);
      res.download(filePath, fileName);
    } catch (err) {
      res.status(502).json({ success: false, error: err.message });
    }
  });

  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

  app.listen(PORT, () => {
    console.log(`\n  Play Store Proxy Server`);
    console.log(`  Listening on http://localhost:${PORT}`);
    console.log(`  Endpoints:`);
    console.log(`    GET /api/rankings            - All apps (JSON)`);
    console.log(`    GET /api/rankings/excel       - All apps (Excel)`);
    console.log(`    GET /api/rankings/games       - Games only (JSON)`);
    console.log(`    GET /api/rankings/games/excel  - Games only (Excel)`);
    console.log(`    GET /api/health              - Health check\n`);
  });
}

// --- Entry Point ---
const args = process.argv.slice(2);

if (args.includes('--ci')) {
  (async () => {
    console.log('[CI] Auto scrape started');
    await saveJSON(gplay.collection.GROSSING, null, '전체 앱');
    await saveJSON(gplay.collection.GROSSING, gplay.category.GAME, '게임');
    console.log('[CI] Done');
    process.exit(0);
  })();
} else if (args.includes('--ci-games-excel')) {
  (async () => {
    console.log('[CI] Auto scrape games Excel started');
    try {
      await saveExcel(gplay.collection.GROSSING, gplay.category.GAME, '게임');
    } catch (err) {
      ciNote('error', `대한민국 (kr) scrape failed: ${err.message}`);
      process.exit(1);
    }
    console.log('[CI] Done');
    process.exit(0);
  })();
} else if (args.includes('--ci-intl')) {
  (async () => {
    console.log('[CI] Auto scrape international markets started');
    // One market failing must not stop the others from being saved, but it
    // must not look like success either: the exit code tells the workflow,
    // which still commits the markets that worked and then fails the run.
    const failed = [];
    for (const market of INTL_MARKETS) {
      try {
        await saveExcelIntl(market);
      } catch (err) {
        failed.push(market);
        ciNote('error', `${market.label} (${market.code}) scrape failed: ${err.message}`);
      }
    }
    if (failed.length) {
      console.log(`[CI] Done with failures: ${failed.map(m => m.code).join(', ')} not collected today (${INTL_MARKETS.length - failed.length}/${INTL_MARKETS.length} saved)`);
      process.exit(1);
    }
    console.log(`[CI] Done: all ${INTL_MARKETS.length} markets saved`);
    process.exit(0);
  })();
} else if (args.includes('--serve')) {
  startServer();
} else {
  (async () => {
    const readline = require('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log(`\n  output folder: ${outputDir}`);
    let running = true;
    while (running) {
      showMenu();
      const answer = await new Promise(resolve => rl.question('  선택 > ', resolve));
      if (answer === null || answer.trim() === '5') running = false;
      else running = await handleMenu(answer);
    }
    rl.close();
    process.exit(0);
  })();
}
