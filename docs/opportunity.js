// 포지셔닝 맵 (기회 맵) -- shared by genre.html (KR) and market.html (each
// international market). Consumes window.OPPORTUNITY_DATA written by
// server/lib/market-report.js: every game that charted in the last 7 days,
// its share of the window's estimated revenue, and its design dimensions
// (core loop, setting, art style, player structure, monetization, age...).
//
// Usage: OpportunityMap.mount(sectionEl, { data, scopeGenre, allowScopeToggle, genreFilter })
//   scopeGenre        -- genre page: the currently selected Play genre
//   allowScopeToggle  -- show the "이 장르만 / 전체 시장" switch
//   genreFilter       -- market page: show a genre <select> instead
// Returns { setScopeGenre(name) }.
(function () {
  'use strict';

  var CSS = [
    '.opp-controls { display: flex; flex-wrap: wrap; gap: 10px 18px; align-items: center; margin-bottom: 16px; }',
    '.opp-controls label { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--ink-2); }',
    '.opp-controls select { font: inherit; font-size: 13.5px; padding: 7px 10px; border-radius: 9px; border: 1px solid var(--border); background: var(--surface-2); color: var(--ink); max-width: 100%; }',
    '.opp-seg { display: inline-flex; border: 1px solid var(--border); border-radius: 999px; overflow: hidden; }',
    '.opp-seg button { font: inherit; font-size: 12.5px; font-weight: 600; padding: 6px 12px; border: 0; background: var(--surface-2); color: var(--ink-2); cursor: pointer; }',
    '.opp-seg button.on { background: var(--accent); color: #fff; }',
    '.opp-swap { font: inherit; font-size: 12.5px; padding: 6px 10px; border-radius: 999px; border: 1px solid var(--border); background: var(--surface); color: var(--ink-2); cursor: pointer; }',
    '.opp-swap:hover, .opp-seg button:hover { border-color: var(--accent); }',
    '.opp-insights { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 12px; margin-bottom: 18px; min-width: 0; }',
    '.opp-insights > * { min-width: 0; }',
    '.opp-card { border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px 10px; background: var(--surface-2); }',
    '.opp-card h3 { font-family: var(--font-body); font-size: 13.5px; font-weight: 700; margin: 0 0 2px; }',
    '.opp-card .oc-desc { font-size: 11.5px; color: var(--ink-muted); margin: 0 0 6px; }',
    '.opp-card ol { list-style: none; margin: 0; padding: 0; }',
    '.opp-card li { border-top: 1px solid var(--border); }',
    '.opp-card li:first-child { border-top: 0; }',
    '.opp-card li button { display: block; width: 100%; text-align: left; font: inherit; background: none; border: 0; padding: 7px 4px; cursor: pointer; color: var(--ink); border-radius: 6px; }',
    '.opp-card li button:hover, .opp-card li button:focus-visible { background: var(--accent-wash); outline: none; }',
    '.opp-card .ic-combo { font-size: 13px; font-weight: 700; }',
    '.opp-card .ic-stat { font-size: 12px; color: var(--ink-2); }',
    '.opp-card .ic-empty { font-size: 12.5px; color: var(--ink-muted); padding: 6px 4px; }',
    '.opp-matrix-wrap { overflow-x: auto; border: 1px solid var(--border); border-radius: 12px; }',
    'table.opp-matrix { border-collapse: separate; border-spacing: 2px; min-width: 100%; background: var(--surface); }',
    '.opp-matrix th, .opp-matrix td { padding: 0; }',
    '.opp-matrix thead th { font-weight: 600; font-size: 12px; color: var(--ink-2); text-align: center; padding: 8px 6px; vertical-align: bottom; min-width: 86px; }',
    '.opp-matrix thead th.corner { text-align: left; font-size: 11px; color: var(--ink-muted); position: sticky; left: 0; background: var(--surface); z-index: 2; }',
    '.opp-matrix .hd-name { display: block; color: var(--ink); font-weight: 700; font-size: 12.5px; line-height: 1.3; }',
    '.opp-matrix .hd-meta { display: block; font-family: var(--font-mono); font-variant-numeric: tabular-nums; font-size: 10.5px; color: var(--ink-muted); margin-top: 2px; font-weight: 500; }',
    '.opp-matrix tbody th { position: sticky; left: 0; z-index: 1; background: var(--surface); text-align: left; padding: 6px 10px 6px 8px; min-width: 124px; max-width: 150px; }',
    '.opp-matrix td.opp-cell { height: 64px; min-width: 86px; border-radius: 6px; text-align: center; vertical-align: middle; cursor: pointer; position: relative; background: var(--surface-2); color: var(--ink-muted); }',
    '.opp-matrix td.opp-cell:focus-visible { outline: 2px solid var(--ink); outline-offset: 1px; }',
    '.opp-matrix td.unc-col, .opp-matrix td.unc-row { opacity: 0.55; }',
    '.oc-share { font-family: var(--font-mono); font-variant-numeric: tabular-nums; font-weight: 700; font-size: 13px; line-height: 1.2; }',
    '.oc-n { font-size: 10.5px; line-height: 1.3; }',
    '.oc-icons { display: flex; justify-content: center; gap: 2px; margin-top: 3px; }',
    '.oc-icons img { width: 16px; height: 16px; border-radius: 4px; object-fit: cover; box-shadow: 0 0 0 1.5px var(--surface); background: var(--surface-2); }',
    '.oc-gap { font-size: 10.5px; font-weight: 700; color: var(--accent); }',
    'td.opp-cell.is-pick { box-shadow: inset 0 0 0 2.5px var(--accent); }',
    'td.opp-cell.is-gap { box-shadow: inset 0 0 0 2px var(--accent); background: var(--accent-wash); background-image: repeating-linear-gradient(135deg, transparent 0 6px, var(--accent-wash) 6px 12px); }',
    'td.opp-cell.is-crowd { box-shadow: inset 0 0 0 2px var(--ink-muted); }',
    'td.opp-cell.is-selected { outline: 3px solid var(--ink); outline-offset: -1px; }',
    'td.opp-cell.h1 { background: var(--heat-1); color: var(--heat-ink-1); } td.opp-cell.h2 { background: var(--heat-2); color: var(--heat-ink-2); }',
    'td.opp-cell.h3 { background: var(--heat-3); color: var(--heat-ink-3); } td.opp-cell.h4 { background: var(--heat-4); color: var(--heat-ink-4); }',
    'td.opp-cell.h5 { background: var(--heat-5); color: var(--heat-ink-5); } td.opp-cell.h6 { background: var(--heat-6); color: var(--heat-ink-6); }',
    '.opp-legend { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 22px; margin-top: 12px; font-size: 12px; color: var(--ink-2); }',
    '.opp-scale { display: inline-flex; align-items: center; gap: 6px; }',
    '.opp-scale .bins { display: inline-flex; gap: 2px; }',
    '.opp-scale .bins span { width: 22px; height: 12px; border-radius: 3px; }',
    '.opp-scale .lbl { font-family: var(--font-mono); font-size: 10.5px; color: var(--ink-muted); }',
    '.opp-mark { display: inline-flex; align-items: center; gap: 6px; }',
    '.opp-mark i { display: inline-block; width: 16px; height: 12px; border-radius: 3px; background: var(--surface-2); }',
    '.opp-mark i.pick { box-shadow: inset 0 0 0 2px var(--accent); } .opp-mark i.gap { box-shadow: inset 0 0 0 1.5px var(--accent); background-image: repeating-linear-gradient(135deg, transparent 0 3px, var(--accent-wash) 3px 6px); }',
    '.opp-mark i.crowd { box-shadow: inset 0 0 0 2px var(--ink-muted); }',
    '.opp-detail { margin-top: 18px; border-top: 1px solid var(--border); padding-top: 16px; }',
    '.opp-detail h3 { font-family: var(--font-body); font-size: 15px; font-weight: 700; margin: 0; }',
    '.opp-detail .od-sub { font-size: 12.5px; color: var(--ink-2); margin: 4px 0 10px; }',
    '.opp-detail .od-actions { margin: 0 0 10px; }',
    '.opp-table-wrap { overflow-x: auto; border: 1px solid var(--border); border-radius: 12px; max-height: 420px; overflow-y: auto; }',
    'table.opp-games { width: 100%; border-collapse: collapse; min-width: 640px; }',
    '.opp-games thead th { position: sticky; top: 0; background: var(--surface-2); text-align: left; font-size: 11.5px; font-weight: 700; color: var(--ink-2); padding: 8px 10px; border-bottom: 1px solid var(--border); white-space: nowrap; }',
    '.opp-games td { padding: 7px 10px; border-bottom: 1px solid var(--border); font-size: 12.5px; vertical-align: middle; }',
    '.opp-games tr:last-child td { border-bottom: 0; }',
    '.opp-games td.num { font-family: var(--font-mono); font-variant-numeric: tabular-nums; white-space: nowrap; }',
    '.opp-games .tags { color: var(--ink-muted); font-size: 11.5px; max-width: 260px; }',
    '.opp-chip { display: inline-block; font-size: 11px; font-weight: 600; border-radius: 999px; padding: 1px 8px; margin: 1px 3px 1px 0; border: 1px solid var(--border); color: var(--ink-2); background: var(--surface); white-space: nowrap; }',
    '.opp-chip.hit { border-color: var(--accent); color: var(--accent); background: var(--accent-wash); }',
    '.opp-concept { margin-top: 22px; border-top: 1px solid var(--border); padding-top: 18px; }',
    '.opp-concept h3 { font-family: var(--font-body); font-size: 15px; font-weight: 700; margin: 0; }',
    '.opp-concept .cc-sub { font-size: 12.5px; color: var(--ink-muted); margin: 3px 0 12px; }',
    '.cc-picks { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; margin-bottom: 14px; }',
    '.cc-picks label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; font-weight: 600; color: var(--ink-2); }',
    '.cc-picks select { font: inherit; font-size: 13px; padding: 7px 9px; border-radius: 9px; border: 1px solid var(--border); background: var(--surface-2); color: var(--ink); }',
    '.cc-verdict { border-radius: 10px; padding: 12px 14px; background: var(--accent-wash); border: 1px solid var(--accent); font-size: 13.5px; color: var(--ink); line-height: 1.55; }',
    '.cc-verdict b { color: var(--accent); }',
    '.cc-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 16px; }',
    '.cc-cols > * { min-width: 0; }',
    '@media (max-width: 860px) { .cc-cols { grid-template-columns: 1fr; } }',
    '.cc-cols h4 { font-size: 13px; margin: 0 0 8px; font-family: var(--font-body); }',
    '.cc-near { list-style: none; margin: 0; padding: 0; }',
    '.cc-near li { padding: 7px 0; border-top: 1px solid var(--border); font-size: 12.5px; }',
    '.cc-near li:first-child { border-top: 0; }',
    '.cc-near .cn-top { display: flex; align-items: center; gap: 8px; }',
    '.cc-near .cn-match { font-family: var(--font-mono); font-size: 11px; font-weight: 700; color: var(--accent); flex-shrink: 0; }',
    '.cc-near .cn-share { font-family: var(--font-mono); font-variant-numeric: tabular-nums; color: var(--ink-2); margin-left: auto; flex-shrink: 0; }',
    '.cc-near .cn-chips { margin-top: 4px; }',
    '.cc-alt { margin-bottom: 14px; }',
    '.cc-alt .ca-title { font-size: 12px; font-weight: 700; color: var(--ink-2); margin-bottom: 5px; }',
    '.ca-row { display: grid; grid-template-columns: 112px 1fr 92px; align-items: center; gap: 8px; font-size: 12px; padding: 2px 0; }',
    '.ca-row .ca-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--ink-2); }',
    '.ca-row.cur .ca-name { color: var(--accent); font-weight: 700; }',
    '.ca-track { height: 10px; border-radius: 3px; background: var(--surface-2); overflow: hidden; }',
    '.ca-fill { height: 100%; border-radius: 3px 0 0 3px; background: var(--seq-450, #2a78d6); }',
    '.ca-row .ca-val { font-family: var(--font-mono); font-variant-numeric: tabular-nums; font-size: 11px; color: var(--ink-2); text-align: right; white-space: nowrap; }',
    '.ca-row .ca-val.zero { color: var(--accent); font-weight: 700; }',
    '.ca-empties { font-size: 11.5px; color: var(--ink-muted); margin-top: 4px; line-height: 1.5; }',
    '.ca-empties b { color: var(--accent); font-weight: 700; }',
    '.opp-method { margin-top: 18px; font-size: 12.5px; color: var(--ink-2); }',
    '.opp-method summary { cursor: pointer; color: var(--accent); font-weight: 600; }',
    '.opp-method ul { margin: 8px 0 0; padding-left: 18px; }',
    '.opp-method li { margin-bottom: 4px; }',
    '.opp-empty { color: var(--ink-muted); font-size: 13px; padding: 14px 4px; }',
    '#oppTooltip { position: fixed; z-index: 70; pointer-events: none; background: #17171a; color: #fff; border-radius: 8px; padding: 8px 11px; font-size: 12.5px; line-height: 1.5; box-shadow: 0 6px 20px rgba(0,0,0,0.35); max-width: 260px; transform: translate(-50%, calc(-100% - 12px)); }',
    '#oppTooltip .tt-title { font-weight: 700; margin-bottom: 3px; }',
    '#oppTooltip .tt-row { display: flex; gap: 10px; white-space: nowrap; color: #c7c6c2; }',
    '#oppTooltip .tt-row b { margin-left: auto; color: #fff; font-family: var(--font-mono); }',
    ':root { --heat-1: #cde2fb; --heat-2: #9ec5f4; --heat-3: #6da7ec; --heat-4: #3987e5; --heat-5: #256abf; --heat-6: #184f95;',
    '  --heat-ink-1: #0b0b0b; --heat-ink-2: #0b0b0b; --heat-ink-3: #0b0b0b; --heat-ink-4: #ffffff; --heat-ink-5: #ffffff; --heat-ink-6: #ffffff; }',
    '@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --heat-1: #0d366b; --heat-2: #184f95; --heat-3: #256abf; --heat-4: #3987e5; --heat-5: #6da7ec; --heat-6: #9ec5f4;',
    '  --heat-ink-1: #ffffff; --heat-ink-2: #ffffff; --heat-ink-3: #ffffff; --heat-ink-4: #ffffff; --heat-ink-5: #0b0b0b; --heat-ink-6: #0b0b0b; } }',
    ':root[data-theme="dark"] { --heat-1: #0d366b; --heat-2: #184f95; --heat-3: #256abf; --heat-4: #3987e5; --heat-5: #6da7ec; --heat-6: #9ec5f4;',
    '  --heat-ink-1: #ffffff; --heat-ink-2: #ffffff; --heat-ink-3: #ffffff; --heat-ink-4: #ffffff; --heat-ink-5: #0b0b0b; --heat-ink-6: #0b0b0b; }',
  ].join('\n');

  var HEAT_BINS = 6;
  // Insight thresholds, relative to the current scope's total share.
  var PICK_MAX_GAMES = 3;      // 공략 후보: at most this many competitors...
  var PICK_MIN_INDEX = 1.3;    // ...each earning >= 1.3x the scope's per-game average...
  var PICK_MIN_SHARE = 0.015;  // ...in a cell holding >= 1.5% of the scope
  var GAP_MIN_EXPECTED = 0.01; // 미개척 공백: independence-expected share >= 1% of the scope
  var CONCEPT_DIMS = ['core', 'setting', 'art', 'mode', 'monet', 'age'];
  var NEW_DAYS = 365;

  function mk(tag, opts) {
    var e = document.createElement(tag);
    opts = opts || {};
    if (opts.cls) e.className = opts.cls;
    if (opts.text != null) e.textContent = opts.text;
    if (opts.attrs) for (var k in opts.attrs) e.setAttribute(k, opts.attrs[k]);
    if (opts.style) for (var k2 in opts.style) e.style[k2] = opts.style[k2];
    if (opts.children) opts.children.forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  function pct(v) { return v > 0 && v < 0.05 ? '<0.1%' : (Math.round(v * 10) / 10).toFixed(1) + '%'; }
  function times(v) { return (Math.round(v * 10) / 10).toFixed(1) + '배'; }
  function sumShare(list) { return list.reduce(function (s, g) { return s + g.share; }, 0); }
  function fmtMD(iso) { var p = (iso || '').split('-'); return p.length === 3 ? p[1] + '.' + p[2] : iso; }

  function injectStyle() {
    if (document.getElementById('oppStyle')) return;
    var st = document.createElement('style');
    st.id = 'oppStyle';
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  var tooltipEl = null;
  function tooltip() {
    if (!tooltipEl) {
      tooltipEl = mk('div', { attrs: { id: 'oppTooltip', role: 'tooltip' } });
      tooltipEl.hidden = true;
      document.body.appendChild(tooltipEl);
    }
    return tooltipEl;
  }
  function showTooltip(evt, build) {
    var t = tooltip();
    clear(t);
    build(t);
    t.hidden = false;
    var r = evt.currentTarget.getBoundingClientRect();
    var x = evt.clientX != null && evt.type !== 'focus' ? evt.clientX : r.left + r.width / 2;
    var y = evt.clientY != null && evt.type !== 'focus' ? evt.clientY : r.top;
    t.style.left = Math.min(Math.max(x, 130), window.innerWidth - 130) + 'px';
    t.style.top = Math.max(y, 90) + 'px';
  }
  function hideTooltip() { if (tooltipEl) tooltipEl.hidden = true; }

  function mount(root, opts) {
    injectStyle();
    var data = opts.data;
    var UNC = data.unclassified || '미분류';
    var dimByKey = {};
    data.dimensions.forEach(function (d) { dimByKey[d.key] = d; });
    var gl = (data.market && data.market.country) || 'kr';
    function playUrl(appId) { return appId ? ('https://play.google.com/store/apps/details?id=' + encodeURIComponent(appId) + '&hl=ko&gl=' + gl) : null; }
    function gameLink(g) {
      var kids = [];
      if (g.icon) kids.push(mk('img', { cls: 'game-icon', attrs: { src: g.icon, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' } }));
      kids.push(mk('span', { cls: 'gl-text', text: g.name }));
      var url = playUrl(g.appId);
      return url
        ? mk('a', { cls: 'game-link', attrs: { href: url, target: '_blank', rel: 'noopener noreferrer', title: g.name + ' — Play 스토어에서 보기' }, children: kids })
        : mk('span', { cls: 'game-link', children: kids });
    }

    var state = {
      rowKey: 'core', colKey: 'setting',
      scopeMode: opts.allowScopeToggle ? 'genre' : 'all',
      scopeGenre: opts.scopeGenre || null,
      genreFilter: '',
      hideUnc: false,
      selected: null,
      concept: {},
    };

    // ------------------------------------------------------------ skeleton
    clear(root);
    var head = mk('div', { cls: 'panel-head', children: [mk('div', { children: [
      mk('h2', { cls: 'panel-title', text: '포지셔닝 맵 — 수요는 있는데 비어 있는 조합 찾기' }),
      mk('p', { cls: 'panel-sub', text: '최근 ' + data.window.days + '일(' + (data.window.from === data.window.to ? fmtMD(data.window.to) : fmtMD(data.window.from) + '~' + fmtMD(data.window.to)) + ')의 ' + data.shareLabel + '을 게임 설계 요소 두 개로 쪼개, 조합별 수요(비중)와 경쟁작 수를 나란히 봅니다. 칸을 누르면 그 조합의 게임이 나옵니다.' })
    ] })] });
    root.appendChild(head);

    var controls = mk('div', { cls: 'opp-controls' });
    var rowSel = mk('select', { attrs: { 'aria-label': '세로축(행) 설계 요소' } });
    var colSel = mk('select', { attrs: { 'aria-label': '가로축(열) 설계 요소' } });
    data.dimensions.forEach(function (d) {
      rowSel.appendChild(mk('option', { attrs: { value: d.key }, text: d.label }));
      colSel.appendChild(mk('option', { attrs: { value: d.key }, text: d.label }));
    });
    rowSel.value = state.rowKey; colSel.value = state.colKey;
    rowSel.addEventListener('change', function () {
      if (rowSel.value === state.colKey) { state.colKey = state.rowKey; colSel.value = state.colKey; }
      state.rowKey = rowSel.value; state.selected = null; render();
    });
    colSel.addEventListener('change', function () {
      if (colSel.value === state.rowKey) { state.rowKey = state.colKey; rowSel.value = state.rowKey; }
      state.colKey = colSel.value; state.selected = null; render();
    });
    var swapBtn = mk('button', { cls: 'opp-swap', attrs: { type: 'button', title: '행과 열 바꾸기' }, text: '⇄ 행/열 바꾸기' });
    swapBtn.addEventListener('click', function () {
      var t = state.rowKey; state.rowKey = state.colKey; state.colKey = t;
      rowSel.value = state.rowKey; colSel.value = state.colKey;
      if (state.selected) state.selected = { r: state.selected.c, c: state.selected.r };
      render();
    });
    controls.appendChild(mk('label', { children: ['세로축(행)', rowSel] }));
    controls.appendChild(mk('label', { children: ['가로축(열)', colSel] }));
    controls.appendChild(swapBtn);

    var scopeSeg = null;
    if (opts.allowScopeToggle) {
      scopeSeg = mk('div', { cls: 'opp-seg', attrs: { role: 'group', 'aria-label': '분석 범위' } });
      [['genre', '이 장르만'], ['all', '전체 시장']].forEach(function (p) {
        var b = mk('button', { attrs: { type: 'button', 'data-mode': p[0] }, text: p[1] });
        b.addEventListener('click', function () { state.scopeMode = p[0]; state.selected = null; render(); });
        scopeSeg.appendChild(b);
      });
      controls.appendChild(mk('label', { children: ['범위', scopeSeg] }));
    }
    if (opts.genreFilter) {
      var genres = {};
      data.games.forEach(function (g) { genres[g.genre] = (genres[g.genre] || 0) + g.share; });
      var gSel = mk('select', { attrs: { 'aria-label': 'Play 장르 필터' } });
      gSel.appendChild(mk('option', { attrs: { value: '' }, text: '전체 장르' }));
      Object.keys(genres).sort(function (a, b) { return genres[b] - genres[a]; }).forEach(function (name) {
        gSel.appendChild(mk('option', { attrs: { value: name }, text: name + ' (' + pct(genres[name]) + ')' }));
      });
      gSel.addEventListener('change', function () { state.genreFilter = gSel.value; state.selected = null; render(); });
      controls.appendChild(mk('label', { children: ['Play 장르', gSel] }));
    }
    var uncBox = mk('input', { attrs: { type: 'checkbox' } });
    uncBox.addEventListener('change', function () { state.hideUnc = uncBox.checked; state.selected = null; render(); });
    controls.appendChild(mk('label', { children: [uncBox, '미분류 숨기기'] }));
    root.appendChild(controls);

    var insightsEl = mk('div', { cls: 'opp-insights' });
    root.appendChild(insightsEl);
    var matrixWrap = mk('div', { cls: 'opp-matrix-wrap' });
    root.appendChild(matrixWrap);
    var legendEl = mk('div', { cls: 'opp-legend' });
    root.appendChild(legendEl);
    var detailEl = mk('div', { cls: 'opp-detail' });
    root.appendChild(detailEl);
    var conceptEl = mk('div', { cls: 'opp-concept' });
    root.appendChild(conceptEl);
    var methodEl = mk('details', { cls: 'opp-method' });
    root.appendChild(methodEl);

    // ------------------------------------------------------------ data shaping
    function scopeGames() {
      return data.games.filter(function (g) {
        if (state.scopeMode === 'genre' && state.scopeGenre) return g.genre === state.scopeGenre;
        if (state.genreFilter) return g.genre === state.genreFilter;
        return true;
      });
    }
    function scopeLabel() {
      if (state.scopeMode === 'genre' && state.scopeGenre) return state.scopeGenre + ' 장르';
      if (state.genreFilter) return state.genreFilter + ' 장르';
      return '전체 시장';
    }
    function valuesFor(dimKey, games) {
      var present = {};
      games.forEach(function (g) { present[g.dims[dimKey]] = true; });
      var out = dimByKey[dimKey].order.filter(function (v) { return present[v]; });
      if (present[UNC]) out.push(UNC);
      return out;
    }

    function buildMatrix() {
      var games = scopeGames();
      if (state.hideUnc) games = games.filter(function (g) { return g.dims[state.rowKey] !== UNC && g.dims[state.colKey] !== UNC; });
      var total = sumShare(games);
      var N = games.length;
      var avgPerGame = N ? total / N : 0;
      var rows = valuesFor(state.rowKey, games);
      var cols = valuesFor(state.colKey, games);
      var cells = {};
      var rowStat = {}, colStat = {};
      rows.forEach(function (r) { rowStat[r] = { n: 0, share: 0 }; });
      cols.forEach(function (c) { colStat[c] = { n: 0, share: 0 }; });
      rows.forEach(function (r) { cols.forEach(function (c) { cells[r + '\u0001' + c] = { r: r, c: c, games: [], share: 0, n: 0, newShare: 0, newN: 0 }; }); });
      games.forEach(function (g) {
        var r = g.dims[state.rowKey], c = g.dims[state.colKey];
        var cell = cells[r + '\u0001' + c];
        cell.games.push(g);
        cell.share += g.share; cell.n += 1;
        if (g.daysSinceRelease != null && g.daysSinceRelease >= 0 && g.daysSinceRelease <= NEW_DAYS) { cell.newShare += g.share; cell.newN += 1; }
        rowStat[r].n += 1; rowStat[r].share += g.share;
        colStat[c].n += 1; colStat[c].share += g.share;
      });
      var maxShare = 0;
      Object.keys(cells).forEach(function (k) {
        var cell = cells[k];
        cell.idx = cell.n && avgPerGame ? (cell.share / cell.n) / avgPerGame : 0;
        cell.expected = total ? rowStat[cell.r].share * colStat[cell.c].share / total : 0;
        cell.unc = cell.r === UNC || cell.c === UNC;
        maxShare = Math.max(maxShare, cell.share);
      });
      return { games: games, total: total, N: N, avgPerGame: avgPerGame, rows: rows, cols: cols, cells: cells, rowStat: rowStat, colStat: colStat, maxShare: maxShare };
    }

    // White-space logic. All thresholds are relative to the current scope so
    // the same rules work for "전체 시장" and a single-genre slice.
    function buildInsights(M) {
      var list = Object.keys(M.cells).map(function (k) { return M.cells[k]; }).filter(function (c) { return !c.unc; });
      var rowNoGap = dimByKey[state.rowKey].gapExcluded || [];
      var colNoGap = dimByKey[state.colKey].gapExcluded || [];
      var picks = list.filter(function (c) { return c.n >= 1 && c.n <= PICK_MAX_GAMES && c.idx >= PICK_MIN_INDEX && c.share >= M.total * PICK_MIN_SHARE; })
        .sort(function (a, b) { return b.share - a.share; }).slice(0, 3);
      var gaps = list.filter(function (c) {
        return c.n === 0 && M.rowStat[c.r].n >= 2 && M.colStat[c.c].n >= 2 && c.expected >= M.total * GAP_MIN_EXPECTED &&
          rowNoGap.indexOf(c.r) === -1 && colNoGap.indexOf(c.c) === -1;
      }).sort(function (a, b) { return b.expected - a.expected; }).slice(0, 3);
      var crowded = list.filter(function (c) { return c.n >= 4 && c.idx < 0.8; })
        .sort(function (a, b) { return b.n - a.n || a.idx - b.idx; }).slice(0, 3);
      var breakthroughs = list.filter(function (c) { return c.newShare > 0; })
        .sort(function (a, b) { return b.newShare - a.newShare; }).slice(0, 3);
      return { picks: picks, gaps: gaps, crowded: crowded, breakthroughs: breakthroughs };
    }

    function heatBin(share, maxShare) {
      if (share <= 0 || maxShare <= 0) return 0;
      return Math.max(1, Math.min(HEAT_BINS, Math.ceil(Math.sqrt(share / maxShare) * HEAT_BINS)));
    }
    function binUpper(k, maxShare) { return maxShare * Math.pow(k / HEAT_BINS, 2); }

    // ------------------------------------------------------------ render
    function render() {
      if (scopeSeg) {
        Array.prototype.forEach.call(scopeSeg.children, function (b) { b.classList.toggle('on', b.getAttribute('data-mode') === state.scopeMode); });
      }
      var M = buildMatrix();
      var I = buildInsights(M);
      renderInsights(M, I);
      renderMatrix(M, I);
      renderLegend(M);
      if (!state.selected || !M.cells[state.selected.r + '\u0001' + state.selected.c]) {
        var first = I.picks[0] || I.gaps[0] || null;
        state.selected = first ? { r: first.r, c: first.c } : null;
        if (state.selected) markSelected();
      }
      renderDetail(M);
      renderConcept();
      renderMethod(M);
    }

    function combo(c) { return c.r + ' × ' + c.c; }
    function renderInsights(M, I) {
      clear(insightsEl);
      if (M.N === 0) return;
      function card(title, desc, items, stat) {
        var ol = mk('ol');
        if (!items.length) ol.appendChild(mk('li', { children: [mk('div', { cls: 'ic-empty', text: '이 범위·축에서는 조건에 맞는 조합이 없습니다' })] }));
        items.forEach(function (c) {
          var btn = mk('button', { attrs: { type: 'button' }, children: [mk('div', { cls: 'ic-combo', text: combo(c) }), mk('div', { cls: 'ic-stat', text: stat(c) })] });
          btn.addEventListener('click', function () { state.selected = { r: c.r, c: c.c }; markSelected(); renderDetail(M); detailEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
          ol.appendChild(mk('li', { children: [btn] }));
        });
        return mk('div', { cls: 'opp-card', children: [mk('h3', { text: title }), mk('p', { cls: 'oc-desc', text: desc }), ol] });
      }
      insightsEl.appendChild(card('🎯 공략 후보', '경쟁작 3개 이하인데 게임당 몫이 평균의 1.3배 이상 — 수요에 비해 공급이 적은 조합', I.picks, function (c) {
        return '게임 ' + c.n + '개가 ' + pct(c.share) + ' · 게임당 평균의 ' + times(c.idx);
      }));
      insightsEl.appendChild(card('🕳 미개척 공백', '수요 큰 행·열이 만나는데 아직 게임이 없음 — 검증 안 된 조합이니 인접 칸 수요와 함께 판단', I.gaps, function (c) {
        return '행 ' + pct(M.rowStat[c.r].share) + ' × 열 ' + pct(M.colStat[c.c].share) + ' 교차 · 기대 비중 ' + pct(c.expected) + ' · 경쟁작 0';
      }));
      insightsEl.appendChild(card('🧱 과밀 구간', '경쟁작 4개 이상인데 게임당 몫은 평균의 0.8배 미만 — 차별화 없이 들어가면 불리', I.crowded, function (c) {
        return '게임 ' + c.n + '개가 ' + pct(c.share) + ' 나눔 · 게임당 ' + times(c.idx);
      }));
      insightsEl.appendChild(card('🚪 신작이 뚫은 조합', '출시 1년 이내 게임이 비중을 가져간 조합 — 지금도 진입이 되는 구간', I.breakthroughs, function (c) {
        return '신작 ' + c.newN + '개가 ' + pct(c.newShare) + ' (칸 전체 ' + c.n + '개 · ' + pct(c.share) + ')';
      }));
    }

    var cellEls = {};
    function markSelected() {
      Object.keys(cellEls).forEach(function (k) { cellEls[k].classList.remove('is-selected'); });
      if (state.selected) {
        var el = cellEls[state.selected.r + '\u0001' + state.selected.c];
        if (el) el.classList.add('is-selected');
      }
    }
    function renderMatrix(M, I) {
      clear(matrixWrap);
      cellEls = {};
      if (M.N === 0) { matrixWrap.appendChild(mk('p', { cls: 'opp-empty', text: '이 범위에는 최근 ' + data.window.days + '일간 차트에 오른 게임이 없습니다.' })); return; }
      var pickSet = {}, gapSet = {}, crowdSet = {};
      I.picks.forEach(function (c) { pickSet[c.r + '\u0001' + c.c] = 1; });
      I.gaps.forEach(function (c) { gapSet[c.r + '\u0001' + c.c] = 1; });
      I.crowded.forEach(function (c) { crowdSet[c.r + '\u0001' + c.c] = 1; });
      var table = mk('table', { cls: 'opp-matrix', attrs: { 'aria-label': dimByKey[state.rowKey].label + ' × ' + dimByKey[state.colKey].label + ' 기회 맵' } });
      var thead = mk('thead');
      var hr = mk('tr');
      hr.appendChild(mk('th', { cls: 'corner', attrs: { scope: 'col' }, text: dimByKey[state.rowKey].label + ' ↓ / ' + dimByKey[state.colKey].label + ' →' }));
      M.cols.forEach(function (c) {
        hr.appendChild(mk('th', { attrs: { scope: 'col' }, children: [
          mk('span', { cls: 'hd-name', text: c }),
          mk('span', { cls: 'hd-meta', text: pct(M.colStat[c].share) + ' · ' + M.colStat[c].n + '개' })
        ] }));
      });
      thead.appendChild(hr);
      table.appendChild(thead);
      var tbody = mk('tbody');
      M.rows.forEach(function (r) {
        var tr = mk('tr');
        tr.appendChild(mk('th', { attrs: { scope: 'row' }, children: [
          mk('span', { cls: 'hd-name', text: r }),
          mk('span', { cls: 'hd-meta', text: pct(M.rowStat[r].share) + ' · ' + M.rowStat[r].n + '개' })
        ] }));
        M.cols.forEach(function (c) {
          var key = r + '\u0001' + c;
          var cell = M.cells[key];
          var bin = heatBin(cell.share, M.maxShare);
          var cls = 'opp-cell' + (bin ? ' h' + bin : '') + (pickSet[key] ? ' is-pick' : '') + (gapSet[key] ? ' is-gap' : '') + (crowdSet[key] ? ' is-crowd' : '') + (r === UNC ? ' unc-row' : '') + (c === UNC ? ' unc-col' : '');
          var td = mk('td', { cls: cls, attrs: { tabindex: '0', 'aria-label': combo(cell) + ': 게임 ' + cell.n + '개, ' + pct(cell.share) } });
          if (cell.n > 0) {
            td.appendChild(mk('div', { cls: 'oc-share', text: pct(cell.share) }));
            td.appendChild(mk('div', { cls: 'oc-n', text: cell.n + '개' }));
            var icons = mk('div', { cls: 'oc-icons' });
            cell.games.slice().sort(function (a, b) { return b.share - a.share; }).slice(0, 3).forEach(function (g) {
              if (g.icon) icons.appendChild(mk('img', { attrs: { src: g.icon, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' } }));
            });
            td.appendChild(icons);
          } else if (gapSet[key]) {
            td.appendChild(mk('div', { cls: 'oc-gap', text: '빈 칸' }));
            td.appendChild(mk('div', { cls: 'oc-n', text: '기대 ' + pct(cell.expected) }));
          } else {
            td.appendChild(mk('div', { cls: 'oc-n', text: '·' }));
          }
          function tip(evt) {
            showTooltip(evt, function (t) {
              t.appendChild(mk('div', { cls: 'tt-title', text: combo(cell) }));
              t.appendChild(mk('div', { cls: 'tt-row', children: ['게임 수', mk('b', { text: cell.n + '개' })] }));
              t.appendChild(mk('div', { cls: 'tt-row', children: [data.shareLabel, mk('b', { text: pct(cell.share) })] }));
              if (cell.n) t.appendChild(mk('div', { cls: 'tt-row', children: ['게임당 몫 (평균=1)', mk('b', { text: times(cell.idx) })] }));
              if (!cell.n) t.appendChild(mk('div', { cls: 'tt-row', children: ['독립 가정 기대 비중', mk('b', { text: pct(cell.expected) })] }));
              if (cell.newN) t.appendChild(mk('div', { cls: 'tt-row', children: ['1년 이내 신작', mk('b', { text: cell.newN + '개 · ' + pct(cell.newShare) })] }));
              cell.games.slice().sort(function (a, b) { return b.share - a.share; }).slice(0, 4).forEach(function (g) {
                t.appendChild(mk('div', { cls: 'tt-row', children: [g.name.length > 22 ? g.name.slice(0, 22) + '…' : g.name, mk('b', { text: pct(g.share) })] }));
              });
            });
          }
          td.addEventListener('pointerenter', tip);
          td.addEventListener('pointermove', tip);
          td.addEventListener('pointerleave', hideTooltip);
          td.addEventListener('focus', tip);
          td.addEventListener('blur', hideTooltip);
          function select() { state.selected = { r: r, c: c }; markSelected(); renderDetail(M); }
          td.addEventListener('click', select);
          td.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(); } });
          cellEls[key] = td;
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      matrixWrap.appendChild(table);
      markSelected();
    }

    function renderLegend(M) {
      clear(legendEl);
      if (M.N === 0) return;
      var bins = mk('span', { cls: 'bins' });
      for (var k = 1; k <= HEAT_BINS; k++) bins.appendChild(mk('span', { style: { background: 'var(--heat-' + k + ')' }, attrs: { title: '~' + pct(binUpper(k, M.maxShare)) } }));
      legendEl.appendChild(mk('span', { cls: 'opp-scale', children: [
        mk('span', { text: data.shareLabel }),
        mk('span', { cls: 'lbl', text: '0' }), bins, mk('span', { cls: 'lbl', text: pct(M.maxShare) })
      ] }));
      legendEl.appendChild(mk('span', { cls: 'opp-mark', children: [mk('i', { cls: 'pick' }), '공략 후보'] }));
      legendEl.appendChild(mk('span', { cls: 'opp-mark', children: [mk('i', { cls: 'gap' }), '미개척 공백'] }));
      legendEl.appendChild(mk('span', { cls: 'opp-mark', children: [mk('i', { cls: 'crowd' }), '과밀'] }));
      legendEl.appendChild(mk('span', { text: '범위: ' + scopeLabel() + ' · 게임 ' + M.N + '개 · ' + pct(M.total) }));
    }

    function gamesTable(list, extraCol) {
      var table = mk('table', { cls: 'opp-games' });
      var headers = ['오늘 순위', '게임', '퍼블리셔', data.shareLabel.replace('추정 ', ''), '출시', '최고가 상품', '연령', 'Play 태그'];
      if (extraCol) headers.splice(2, 0, extraCol.label);
      table.appendChild(mk('thead', { children: [mk('tr', { children: headers.map(function (h) { return mk('th', { text: h }); }) })] }));
      var tb = mk('tbody');
      list.forEach(function (g) {
        var cells = [
          mk('td', { cls: 'num', text: g.rank != null ? g.rank + '위' : '차트아웃' }),
          mk('td', { style: { fontWeight: 600 }, children: [gameLink(g)] }),
          mk('td', { text: g.publisher, style: { color: 'var(--ink-2)' } }),
          mk('td', { cls: 'num', text: pct(g.share) }),
          mk('td', { cls: 'num', text: g.daysSinceRelease != null ? (g.daysSinceRelease <= NEW_DAYS ? 'D+' + g.daysSinceRelease : Math.floor(g.daysSinceRelease / 365) + '년 전') : '–' }),
          mk('td', { cls: 'num', text: g.iapMaxUsd != null ? '≈$' + g.iapMaxUsd : (g.iapRange ? '?' : '없음') }),
          mk('td', { text: g.dims.age }),
          mk('td', { cls: 'tags', text: g.tags && g.tags.length ? g.tags.join(', ') : '(태그 없음)' })
        ];
        if (extraCol) cells.splice(2, 0, mk('td', { children: extraCol.render(g) }));
        tb.appendChild(mk('tr', { children: cells }));
      });
      table.appendChild(tb);
      return mk('div', { cls: 'opp-table-wrap', children: [table] });
    }

    function renderDetail(M) {
      clear(detailEl);
      if (!state.selected) { detailEl.appendChild(mk('p', { cls: 'opp-empty', text: '칸을 누르면 그 조합에 속한 게임 목록이 여기에 나옵니다.' })); return; }
      var cell = M.cells[state.selected.r + '\u0001' + state.selected.c];
      if (!cell) return;
      detailEl.appendChild(mk('h3', { text: dimByKey[state.rowKey].label + ' ' + cell.r + ' × ' + dimByKey[state.colKey].label + ' ' + cell.c }));
      var takeBtn = mk('button', { cls: 'opp-swap', attrs: { type: 'button' }, text: '↓ 이 조합을 우리 컨셉으로 가져오기' });
      takeBtn.addEventListener('click', function () {
        if (CONCEPT_DIMS.indexOf(state.rowKey) >= 0 && cell.r !== UNC) state.concept[state.rowKey] = cell.r;
        if (CONCEPT_DIMS.indexOf(state.colKey) >= 0 && cell.c !== UNC) state.concept[state.colKey] = cell.c;
        renderConcept();
        conceptEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      if (cell.n > 0) {
        detailEl.appendChild(mk('p', { cls: 'od-sub', text: '게임 ' + cell.n + '개 · ' + data.shareLabel + ' ' + pct(cell.share) + ' · 게임당 몫 평균의 ' + times(cell.idx) + (cell.newN ? ' · 1년 이내 신작 ' + cell.newN + '개(' + pct(cell.newShare) + ')' : '') }));
        detailEl.appendChild(mk('div', { cls: 'od-actions', children: [takeBtn] }));
        detailEl.appendChild(gamesTable(cell.games.slice().sort(function (a, b) { return b.share - a.share; })));
        return;
      }
      var rowGames = M.games.filter(function (g) { return g.dims[state.rowKey] === cell.r; }).sort(function (a, b) { return b.share - a.share; });
      var colGames = M.games.filter(function (g) { return g.dims[state.colKey] === cell.c; }).sort(function (a, b) { return b.share - a.share; });
      detailEl.appendChild(mk('p', { cls: 'od-sub', text: '이 조합의 게임은 없습니다. 같은 행(' + cell.r + ') 게임 ' + rowGames.length + '개가 ' + pct(M.rowStat[cell.r].share) + ', 같은 열(' + cell.c + ') 게임 ' + colGames.length + '개가 ' + pct(M.colStat[cell.c].share) + '를 차지합니다 — 두 요소를 합친 게임이 있다면 누구와 경쟁하게 될지 아래 인접 게임으로 가늠해보세요.' }));
      detailEl.appendChild(mk('div', { cls: 'od-actions', children: [takeBtn] }));
      var neighbors = rowGames.slice(0, 5).concat(colGames.slice(0, 5));
      detailEl.appendChild(gamesTable(neighbors, {
        label: '인접 기준',
        render: function (g) { return [mk('span', { cls: 'opp-chip hit', text: g.dims[state.rowKey] === cell.r ? '같은 행: ' + cell.r : '같은 열: ' + cell.c })]; }
      }));
    }

    // ------------------------------------------------------------ concept checker
    var conceptBuilt = false;
    var conceptSelects = {};
    var conceptOut = null;
    function renderConcept() {
      if (!conceptBuilt) {
        conceptBuilt = true;
        conceptEl.appendChild(mk('h3', { text: '우리 게임 컨셉 대입해보기' }));
        conceptEl.appendChild(mk('p', { cls: 'cc-sub', text: '기획 중인 게임의 설계 요소를 고르면, 똑같은 조합의 경쟁작과 가장 가까운 경쟁작, 그리고 요소 하나만 바꿨을 때 경쟁 구도가 어떻게 달라지는지 보여줍니다. 모르는 항목은 “상관없음”으로 두세요.' }));
        var picks = mk('div', { cls: 'cc-picks' });
        CONCEPT_DIMS.forEach(function (key) {
          var d = dimByKey[key];
          var sel = mk('select', { attrs: { 'aria-label': d.label } });
          sel.appendChild(mk('option', { attrs: { value: '' }, text: '상관없음' }));
          d.order.forEach(function (v) { sel.appendChild(mk('option', { attrs: { value: v }, text: v })); });
          sel.addEventListener('change', function () { if (sel.value) state.concept[key] = sel.value; else delete state.concept[key]; renderConcept(); });
          conceptSelects[key] = sel;
          picks.appendChild(mk('label', { children: [d.label, sel] }));
        });
        conceptEl.appendChild(picks);
        conceptOut = mk('div');
        conceptEl.appendChild(conceptOut);
      }
      CONCEPT_DIMS.forEach(function (key) { conceptSelects[key].value = state.concept[key] || ''; });
      clear(conceptOut);
      var chosen = CONCEPT_DIMS.filter(function (k) { return state.concept[k]; });
      var pool = scopeGames();
      if (!chosen.length) {
        conceptOut.appendChild(mk('p', { cls: 'opp-empty', text: '요소를 하나 이상 고르거나, 위 맵에서 칸을 고른 뒤 “이 조합을 우리 컨셉으로 가져오기”를 누르세요.' }));
        return;
      }
      var total = sumShare(pool);
      var avg = pool.length ? total / pool.length : 0;
      function matches(g, except) {
        return chosen.every(function (k) { return k === except || g.dims[k] === state.concept[k]; });
      }
      var exact = pool.filter(function (g) { return matches(g, null); });
      var exactShare = sumShare(exact);
      var verdict = mk('div', { cls: 'cc-verdict' });
      var conceptText = chosen.map(function (k) { return state.concept[k]; }).join(' · ');
      verdict.appendChild(mk('div', { children: [mk('b', { text: conceptText }), ' (' + scopeLabel() + ' 기준)'] }));
      if (exact.length === 0) {
        verdict.appendChild(mk('div', { text: '→ 이 조합을 모두 갖춘 경쟁작이 최근 ' + data.window.days + '일 차트에 없습니다. 빈 공간이지만 수요도 검증되지 않았으니, 아래 “요소 하나만 바꾸면”에서 인접 조합의 수요를 확인하세요.' }));
      } else {
        var idx = avg ? (exactShare / exact.length) / avg : 0;
        verdict.appendChild(mk('div', { text: '→ 같은 조합 경쟁작 ' + exact.length + '개가 ' + pct(exactShare) + '를 차지합니다. 게임당 몫은 평균의 ' + times(idx) + (idx >= 1.5 ? ' — 수요 대비 덜 붐비는 조합입니다.' : idx < 0.8 ? ' — 이미 붐비는 조합이라 뚜렷한 차별점이 필요합니다.' : ' — 평균 수준의 경쟁입니다.') }));
      }
      conceptOut.appendChild(verdict);

      var cols = mk('div', { cls: 'cc-cols' });
      // nearest competitors
      var near = pool.map(function (g) {
        var hit = chosen.filter(function (k) { return g.dims[k] === state.concept[k]; }).length;
        return { g: g, hit: hit };
      }).filter(function (x) { return x.hit > 0; }).sort(function (a, b) { return b.hit - a.hit || b.g.share - a.g.share; }).slice(0, 8);
      var nearList = mk('ul', { cls: 'cc-near' });
      if (!near.length) nearList.appendChild(mk('li', { cls: 'opp-empty', text: '겹치는 요소가 있는 게임이 없습니다.' }));
      near.forEach(function (x) {
        var chips = mk('div', { cls: 'cn-chips' });
        chosen.forEach(function (k) {
          var same = x.g.dims[k] === state.concept[k];
          chips.appendChild(mk('span', { cls: 'opp-chip' + (same ? ' hit' : ''), text: (same ? '' : dimByKey[k].label + ': ') + x.g.dims[k] }));
        });
        nearList.appendChild(mk('li', { children: [
          mk('div', { cls: 'cn-top', children: [mk('span', { cls: 'cn-match', text: x.hit + '/' + chosen.length }), gameLink(x.g), mk('span', { cls: 'cn-share', text: (x.g.rank != null ? x.g.rank + '위 · ' : '') + pct(x.g.share) })] }),
          chips
        ] }));
      });
      cols.appendChild(mk('div', { children: [mk('h4', { text: '가장 가까운 경쟁작 (겹치는 요소 수 → 비중 순)' }), nearList] }));

      // one-change alternatives
      var alts = mk('div');
      chosen.forEach(function (k) {
        var base = pool.filter(function (g) { return matches(g, k); });
        var d = dimByKey[k];
        var baseShare = sumShare(base);
        var box = mk('div', { cls: 'cc-alt' });
        var others = chosen.filter(function (o) { return o !== k; }).map(function (o) { return state.concept[o]; });
        box.appendChild(mk('div', { cls: 'ca-title', text: d.label + '만 바꾸면' + (others.length ? ' (나머지: ' + others.join(' · ') + ' 고정, 게임 ' + base.length + '개 · ' + pct(baseShare) + ')' : ' (다른 조건 없음)') }));
        var byVal = {};
        base.forEach(function (g) { var v = g.dims[k]; byVal[v] = byVal[v] || { n: 0, share: 0 }; byVal[v].n += 1; byVal[v].share += g.share; });
        var maxS = 0;
        d.order.forEach(function (v) { if (byVal[v]) maxS = Math.max(maxS, byVal[v].share); });
        var empties = [];
        d.order.forEach(function (v) {
          var s = byVal[v] || { n: 0, share: 0 };
          var isCur = v === state.concept[k];
          if (s.n === 0 && !isCur) { empties.push(v); return; }
          box.appendChild(mk('div', { cls: 'ca-row' + (isCur ? ' cur' : ''), children: [
            mk('span', { cls: 'ca-name', text: (isCur ? '▶ ' : '') + v, attrs: { title: v } }),
            mk('span', { cls: 'ca-track', children: [mk('span', { cls: 'ca-fill', style: { display: 'block', width: (maxS ? s.share / maxS * 100 : 0) + '%' } })] }),
            mk('span', { cls: 'ca-val' + (s.n === 0 ? ' zero' : ''), text: s.n === 0 ? '빈 칸' : s.n + '개 · ' + pct(s.share) })
          ] }));
        });
        if (empties.length) box.appendChild(mk('div', { cls: 'ca-empties', children: [mk('b', { text: '경쟁작 없음: ' }), document.createTextNode(empties.join(', '))] }));
        alts.appendChild(box);
      });
      cols.appendChild(mk('div', { children: [mk('h4', { text: '요소 하나만 바꾸면 — 경쟁작 수와 비중' }), alts] }));
      conceptOut.appendChild(cols);
      if (exact.length) {
        conceptOut.appendChild(mk('h4', { text: '같은 조합 경쟁작 전체', style: { fontSize: '13px', margin: '16px 0 8px', fontFamily: 'var(--font-body)' } }));
        conceptOut.appendChild(gamesTable(exact.slice().sort(function (a, b) { return b.share - a.share; })));
      }
    }

    function renderMethod(M) {
      clear(methodEl);
      methodEl.appendChild(mk('summary', { text: '분류 기준과 계산 방법' }));
      var ul = mk('ul');
      ul.appendChild(mk('li', { text: data.shareLabel + ': 최근 ' + data.window.days + '일 동안 매일의 순위를 순위^-' + data.weightExponent + ' 가중치로 바꿔 평균낸 뒤 전체 대비 비율로 나타낸 값입니다. 실제 매출액이 아니라 상위권일수록 몫이 급격히 커지는 차트 구조를 근사한 상대 비중입니다.' + (data.market.metric !== 'GROSSING' ? ' 이 마켓은 매출 차트가 없어 인기(다운로드) 순위로 계산했습니다.' : '') }));
      ul.appendChild(mk('li', { text: '게임당 몫 = 칸의 비중 ÷ 칸의 게임 수를, 현재 범위 전체의 게임당 평균 비중으로 나눈 값입니다. 1배보다 크면 그 조합의 게임들이 평균보다 많이 벌고 있다(수요 대비 공급이 적다)는 뜻입니다.' }));
      ul.appendChild(mk('li', { text: '미개척 공백의 기대 비중 = 행 비중 × 열 비중 ÷ 전체 비중 (두 요소가 서로 무관하다고 가정했을 때 그 칸에 있을 법한 비중). 게임이 없는 이유가 수요가 없어서일 수도 있으니 참고치로만 보세요.' }));
      data.dimensions.forEach(function (d) { ul.appendChild(mk('li', { text: d.label + ': ' + d.hint })); });
      ul.appendChild(mk('li', { text: 'Play 태그가 있는 게임 ' + data.tagCoverage.withTags + '/' + data.tagCoverage.total + '개. 태그가 없으면 제목·요약·설명 첫머리의 키워드로만 판정하고, 근거가 없으면 추측하지 않고 “' + UNC + '”로 남깁니다. 태그 수집은 2026-09-26부터라 그 전에만 차트에 있던 게임은 미분류가 많을 수 있습니다.' }));
      ul.appendChild(mk('li', { text: '과금 강도의 달러 환산은 구간 분류용 고정 환율 근사치입니다.' }));
      methodEl.appendChild(ul);
    }

    render();

    return {
      setScopeGenre: function (name) {
        state.scopeGenre = name;
        state.selected = null;
        render();
      }
    };
  }

  window.OpportunityMap = { mount: mount };
})();
