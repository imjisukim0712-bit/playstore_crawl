// Null-safety patches for google-play-scraper, applied on every `npm install`
// (package.json "postinstall"), so CI and local runs scrape with the same code.
//
// The library hands every mapped field to its parser even when Play's page
// leaves that field out. A single listing without, say, a developer link then
// throws -- and because the list call fetches all 100 detail pages with
// Promise.all, that one listing throws away the whole market's chart
// (2026-10-02: GB/IN/RU all lost to "Cannot read properties of undefined
// (reading 'split')").
//
// Each patch is idempotent. If the library ever changes so a target line is
// neither found nor already patched, this exits non-zero instead of letting
// the scraper run unpatched.

const fs = require('fs');
const path = require('path');

const libDir = path.join(__dirname, '..', 'node_modules', 'google-play-scraper', 'lib');

const PATCHES = [
  {
    file: 'utils/mappingHelpers.js',
    from: 'searchArray === null || searchArray.length === 0',
    to: 'searchArray === null || searchArray === undefined || searchArray.length === 0',
  },
  {
    file: 'utils/mappingHelpers.js',
    from: "description.replace(/<br>/g, '\\r\\n')",
    to: "(description || '').replace(/<br>/g, '\\r\\n')",
  },
  {
    file: 'app.js',
    from: "(devUrl) => devUrl.split('id=')[1]",
    to: "(devUrl) => (devUrl ? devUrl.split('id=')[1] : undefined)",
  },
  {
    file: 'utils/appList.js',
    from: "return link.split('?id=')[1];",
    to: "return link ? link.split('?id=')[1] : undefined;",
  },
];

if (!fs.existsSync(libDir)) {
  console.log('[patch-google-play-scraper] library not installed, nothing to patch');
  process.exit(0);
}

let failed = false;
for (const p of PATCHES) {
  const file = path.join(libDir, p.file);
  const src = fs.readFileSync(file, 'utf-8');
  if (src.includes(p.to) && !src.includes(p.from)) continue; // already patched
  if (!src.includes(p.from)) {
    console.error(`[patch-google-play-scraper] target not found in ${p.file}: ${p.from}`);
    failed = true;
    continue;
  }
  fs.writeFileSync(file, src.split(p.from).join(p.to), 'utf-8');
  console.log(`[patch-google-play-scraper] patched ${p.file}`);
}
process.exit(failed ? 1 : 0);
