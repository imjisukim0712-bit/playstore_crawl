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

async function scrapeRankings(collection, category, opts) {
  opts = opts || {};
  const country = opts.country || 'kr';
  const lang = opts.lang || 'ko';
  const params = { collection, num: 100, country, lang, fullDetail: true };
  if (category) params.category = category;
  const apps = await gplay.list(params);
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
  }));
}

function toRow(r) {
  return {
    순위: r.rank,
    '앱 이름': r.name,
    퍼블리셔: r.publisher,
    카테고리: r.category,
    '세부 카테고리': r.subCategory,
    장르ID: r.genreId,
    앱ID: r.appId,
    출시일: r.released,
  };
}

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
  ws['!cols'] = [{ wch: 6 }, { wch: 40 }, { wch: 30 }, { wch: 12 }, { wch: 14 }, { wch: 20 }, { wch: 34 }, { wch: 12 }];
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
const INTL_MARKETS = [
  { code: 'us', country: 'us', lang: 'en', label: '미국', collection: 'GROSSING' },
  { code: 'jp', country: 'jp', lang: 'ja', label: '일본', collection: 'GROSSING' },
  { code: 'ru', country: 'ru', lang: 'ru', label: '러시아', collection: 'TOP_FREE' },
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
      ws['!cols'] = [{ wch: 6 }, { wch: 40 }, { wch: 30 }, { wch: 12 }, { wch: 14 }, { wch: 20 }, { wch: 34 }, { wch: 12 }];
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
      ws['!cols'] = [{ wch: 6 }, { wch: 40 }, { wch: 30 }, { wch: 12 }, { wch: 14 }, { wch: 20 }, { wch: 34 }, { wch: 12 }];
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
    await saveExcel(gplay.collection.GROSSING, gplay.category.GAME, '게임');
    console.log('[CI] Done');
    process.exit(0);
  })();
} else if (args.includes('--ci-intl')) {
  (async () => {
    console.log('[CI] Auto scrape international markets started');
    for (const market of INTL_MARKETS) {
      try {
        await saveExcelIntl(market);
      } catch (err) {
        console.error(`[CI] ${market.label} (${market.code}) failed:`, err.message);
      }
    }
    console.log('[CI] Done');
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
