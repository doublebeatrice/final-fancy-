#!/usr/bin/env node
'use strict';

/**
 * Export a WeCom (企业微信) / Tencent Docs SPREADSHEET to a local .xlsx.
 *
 * Why this exists: the companion export_tencent_doc.js handles canvas-rendered
 * DOCUMENTS (melo editor box tree). Spreadsheets use a different engine —
 * window.SpreadsheetApp — that paints to <canvas> and lazy-loads each sheet's
 * cell grid only when that sheet is the ACTIVE one. There is no public "load
 * sheet N" API and no DOM table to scrape. We drive the real app over CDP:
 *   1. Un-throttle the renderer (Page.setWebLifecycleState=active) so a
 *      backgrounded/minimized debug Chrome still loads cell data.
 *   2. For each sheet: click its bottom tab (the only reliable activation),
 *      poll until SpreadsheetApp.workbook...cellDataGrid stops being empty.
 *   3. Read the in-memory grid (value + type + numberFormat.formatCode) and
 *      hand it to the xlsx writer, which preserves dates/percentages by
 *      reusing the original Excel format codes.
 *
 * Only the ACTIVE sheet holds data at a time (switching tabs evicts the prior
 * grid), so we must read each sheet fully before moving to the next.
 *
 * This stage writes a JSON intermediate (data/doc_exports/<slug>.sheets.json).
 * build_xlsx_from_sheets.js turns it into the final workbook (keeps the heavy
 * CDP extraction and the xlsx-writing concern separate and independently
 * re-runnable).
 *
 * Usage:
 *   node scripts/execute/export_wecom_sheet.js <docUrl> [--out file.json]
 *        [--skip "账号密码,其他表"] [--only "每日数据,看板（1）"]
 *        [--timeout 25000] [--json]
 *
 * Requires the project debug Chrome on port 9222 (npm run chrome:ready),
 * already logged into the doc's workspace with the sheet URL open (or it will
 * open a tab for it).
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const DEBUG_PORT = Number(process.env.AD_OPS_CHROME_DEBUG_PORT || 9222);
const DEBUG_HOST = '127.0.0.1';
const PROJECT_ROOT = path.join(__dirname, '..', '..');
const DEFAULT_OUT_DIR = path.join(PROJECT_ROOT, 'data', 'doc_exports');

// Sheets that hold credentials / secrets are skipped by default so they never
// land on disk in plaintext. Override with --skip "" to force-include (not
// recommended) or add more names.
const DEFAULT_SKIP = ['账号密码'];

const sleep = ms => new Promise(r => setTimeout(r, ms));

function httpGet(pathname) {
  return new Promise((resolve, reject) => {
    http.get(`http://${DEBUG_HOST}:${DEBUG_PORT}${pathname}`, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function listTabs() {
  return JSON.parse(await httpGet('/json/list'));
}

async function openTab(url) {
  const enc = encodeURIComponent(url);
  let raw;
  try {
    raw = await new Promise((resolve, reject) => {
      const req = http.request(
        { host: DEBUG_HOST, port: DEBUG_PORT, path: `/json/new?${enc}`, method: 'PUT' },
        res => { let d = ''; res.on('data', c => (d += c)); res.on('end', () => resolve(d)); }
      );
      req.on('error', reject);
      req.end();
    });
  } catch (_) {
    raw = await httpGet(`/json/new?${enc}`);
  }
  return JSON.parse(raw);
}

function normalizeDocUrl(input) {
  const m = String(input || '').match(/https?:\/\/[^\s'"]+/);
  if (!m) throw new Error(`No URL found in argument: ${input}`);
  return m[0];
}

function slugFromUrl(url) {
  const m = url.match(/\/sheet\/([A-Za-z0-9_-]+)/) || url.match(/\/([A-Za-z0-9_-]{6,})(?:\?|$)/);
  return (m && m[1]) ? m[1].slice(0, 40) : 'wecom_sheet';
}

function connectPage(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();
  ws.on('message', data => {
    const msg = JSON.parse(data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id).resolve(msg); pending.delete(msg.id); }
  });
  const ready = new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });
  function send(method, params = {}, timeoutMs = 0) {
    const id = nextId++;
    const base = new Promise(resolve => { pending.set(id, { resolve }); ws.send(JSON.stringify({ id, method, params })); });
    if (!timeoutMs) return base;
    return Promise.race([
      base,
      new Promise((_, rej) => setTimeout(() => { pending.delete(id); rej(new Error('cdp timeout: ' + method)); }, timeoutMs)),
    ]);
  }
  async function evaluate(expression) {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) {
      const d = r.result.exceptionDetails;
      const msg = (d.exception && d.exception.description) || d.text || JSON.stringify(d);
      throw new Error('page eval failed: ' + String(msg).slice(0, 300));
    }
    return r.result && r.result.result && r.result.result.value;
  }
  return { ws, ready, send, evaluate };
}

// Returns the list of sheet names in tab order, straight from the workbook.
const LIST_SHEETS_FN = `(() => {
  try {
    const wsm = window.SpreadsheetApp.workbook.worksheetManager;
    return { ok: true, names: wsm.getSheetNameList() };
  } catch (e) { return { ok: false, error: String(e).slice(0, 200) }; }
})()`;

// Clicks the bottom tab for <name>, scrolling it into view first. Returns the
// click coordinate (or an error). The actual click is issued via CDP Input
// events by the caller, because synthetic DOM events don't switch the sheet.
function tabCoordFn(name) {
  return `(() => {
    let el = null;
    document.querySelectorAll('.tab-bar-item-container').forEach(c => {
      if ((c.textContent || '').trim() === ${JSON.stringify(name)}) el = c;
    });
    if (!el) return { found: false };
    el.scrollIntoView({ inline: 'center', block: 'nearest' });
    const r = el.getBoundingClientRect();
    return { found: true, x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  })()`;
}

// True once the named sheet's grid has populated (or it is genuinely empty and
// we've waited long enough — caller decides via the timeout).
function gridStateFn(name) {
  return `(() => {
    try {
      const s = window.SpreadsheetApp.workbook.worksheetManager.getSheetBySheetName(${JSON.stringify(name)});
      const g = s.cellDataGrid;
      const ur = g.usedRange;
      return { empty: g.isEmpty(), endRow: ur.endRowIndex, endCol: ur.endColIndex };
    } catch (e) { return { error: String(e).slice(0, 160) }; }
  })()`;
}

// Returns the displayed/hidden state of each sheet: state 1 = visible (has a
// clickable tab), 2 = hidden (no tab — must be temporarily unhidden to load).
const SHEET_STATES_FN = `(() => {
  const wsm = window.SpreadsheetApp.workbook.worksheetManager;
  const out = {};
  for (const s of wsm.getSheetList()) {
    try { out[s.getSheetName()] = { id: s.getSheetId(), state: s.getSheetState() }; }
    catch (e) {}
  }
  return out;
})()`;

// Installs a guard that swallows outbound commits, so any state change we make
// to read a hidden sheet stays LOCAL and is never synced to the server / other
// collaborators. Idempotent. Paired with removeCommitGuardFn at the end.
const INSTALL_GUARD_FN = `(() => {
  const cs = window.SpreadsheetApp.commitService;
  if (!window.__wecomExportGuard) {
    window.__wecomExportGuard = { blocked: 0, orig: cs.commitMutation.bind(cs) };
    cs.commitMutation = function () { window.__wecomExportGuard.blocked++; return Promise.resolve(); };
  }
  return { installed: true };
})()`;

const REMOVE_GUARD_FN = `(() => {
  const g = window.__wecomExportGuard;
  if (g) {
    window.SpreadsheetApp.commitService.commitMutation = g.orig;
    const n = g.blocked;
    delete window.__wecomExportGuard;
    return { removed: true, blocked: n };
  }
  return { removed: false };
})()`;


// Reads the full active-sheet grid into a compact JSON matrix. Each non-empty
// cell becomes { r, c, v, t, f } where v=value, t=type, f=Excel format code.
// Runs entirely in-page to avoid 564*106 CDP round-trips.
function readSheetFn(name) {
  return `(() => {
    const s = window.SpreadsheetApp.workbook.worksheetManager.getSheetBySheetName(${JSON.stringify(name)});
    const g = s.cellDataGrid;
    const ur = g.usedRange;
    if (g.isEmpty() || ur.endRowIndex < 0) {
      return { name: ${JSON.stringify(name)}, rows: 0, cols: 0, cells: [], merges: [] };
    }
    const rowCount = ur.endRowIndex + 1;
    const colCount = ur.endColIndex + 1;
    const cells = [];
    const mergeSet = new Set();
    const merges = [];
    for (let r = 0; r <= ur.endRowIndex; r++) {
      for (let c = 0; c <= ur.endColIndex; c++) {
        let cell;
        try { cell = g.getCellData(r, c); } catch (e) { continue; }
        if (!cell) continue;
        // Merged cells repeat a mergeReference on every covered cell; record the
        // anchor merge once and skip the value on non-anchor cells.
        const mr = cell.mergeReference;
        if (mr) {
          const k = mr.startRowIndex + ':' + mr.startColIndex + ':' + mr.endRowIndex + ':' + mr.endColIndex;
          if (!mergeSet.has(k)) {
            mergeSet.add(k);
            merges.push({ sr: mr.startRowIndex, sc: mr.startColIndex, er: mr.endRowIndex, ec: mr.endColIndex });
          }
          if (r !== mr.startRowIndex || c !== mr.startColIndex) continue;
        }
        if (cell.value === undefined || cell.value === null || cell.value === '') {
          if (!('type' in cell)) continue;
        }
        const out = { r, c, v: cell.value, t: cell.type };
        const nf = cell.style && cell.style.numberFormat;
        if (nf && nf.formatCode) out.f = nf.formatCode;
        cells.push(out);
      }
    }
    return { name: ${JSON.stringify(name)}, rows: rowCount, cols: colCount, cells, merges };
  })()`;
}

/**
 * Activate a sheet so its lazy cell grid loads, then poll until non-empty.
 *
 * The sheet MUST already have a visible tab (visible sheets always do; hidden
 * sheets are batch-unhidden up front by the caller). We click the tab via CDP
 * mouse events — synthetic DOM clicks don't switch the sheet.
 *
 * Two timing hazards handled here:
 *  - scrollIntoView animates, so the first getBoundingClientRect can be stale;
 *    we settle, then re-read the coordinate right before clicking.
 *  - a single click occasionally misses (mid-scroll); we retry up to 3 times,
 *    re-reading the coordinate each time.
 *
 * Returns { activated, reason?, state? }. A genuinely blank sheet times out and
 * returns activated:false — the caller still reads it (yielding zero cells).
 */
async function activateSheet(conn, name, timeoutMs) {
  const { send, evaluate } = conn;
  const perTry = Math.max(6000, Math.floor(timeoutMs / 3));

  for (let attempt = 0; attempt < 3; attempt++) {
    // Scroll the tab into view, settle the animation, then read a fresh coord.
    await evaluate(tabCoordFn(name)); // first call issues scrollIntoView
    await sleep(650);
    const coord = await evaluate(tabCoordFn(name));
    if (!coord || !coord.found) { await sleep(400); continue; }
    if (!(coord.x > 0)) { await sleep(400); continue; }

    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: coord.x, y: coord.y });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: coord.x, y: coord.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: coord.x, y: coord.y, button: 'left', clickCount: 1 });

    const deadline = Date.now() + perTry;
    let last = null;
    while (Date.now() < deadline) {
      await sleep(600);
      const st = await evaluate(gridStateFn(name));
      last = st;
      if (st && st.empty === false) return { activated: true, state: st };
    }
    // Grid still empty after this attempt — re-click on the next loop.
  }
  return { activated: false, reason: 'load_timeout' };
}

/**
 * Batch set the displayed state for many sheets (1=show, 2=hide) in a single
 * in-page pass, so the tab strip re-renders once instead of per sheet. Relies
 * on the commit guard being installed so nothing syncs. Each sheet is retried
 * a few times because the setter occasionally no-ops mid re-render — important
 * for the re-hide pass so we never leave the user's doc view altered.
 * Returns counts.
 */
async function setSheetStatesBatch(conn, infos, state) {
  const ids = infos.map(i => i.id);
  const expr = `(async () => {
    const sa = window.SpreadsheetApp.behaviorApi.sheetApi;
    const wsm = window.SpreadsheetApp.workbook.worksheetManager;
    const ids = ${JSON.stringify(ids)};
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    let ok = 0, fail = 0;
    for (const id of ids) {
      const s = wsm.getSheetBySheetId(id);
      if (!s) { fail++; continue; }
      for (let k = 0; k < 4 && s.getSheetState() !== ${state}; k++) {
        try { sa.setSheetState({ sheetId: id, sheetState: ${state} }); } catch (e) {}
        await sleep(120);
      }
      if (s.getSheetState() === ${state}) ok++; else fail++;
    }
    return { ok, fail };
  })()`;
  return conn.evaluate(expr).catch(() => ({ ok: 0, fail: ids.length }));
}

/**
 * Extract every requested sheet from the doc into a JSON intermediate.
 */
async function exportWecomSheet(docUrlInput, opts = {}) {
  const docUrl = normalizeDocUrl(docUrlInput);
  const timeoutMs = opts.timeoutMs || 25000;
  const skip = new Set(opts.skip || DEFAULT_SKIP);
  const only = opts.only && opts.only.length ? new Set(opts.only) : null;

  const tabs = await listTabs();
  let tab = tabs.find(t => t.type === 'page' && t.url && t.url.split('#')[0].startsWith(docUrl.split('?')[0]));
  let openedTab = false;
  if (!tab) { tab = await openTab(docUrl); openedTab = true; }
  if (!tab || !tab.webSocketDebuggerUrl) {
    throw new Error('Could not open/attach a tab for the sheet. Is debug Chrome on port ' + DEBUG_PORT + '?');
  }

  const conn = connectPage(tab.webSocketDebuggerUrl);
  await conn.ready;
  await conn.send('Page.enable').catch(() => {});
  await conn.send('Page.bringToFront').catch(() => {});
  // Critical: a minimized/backgrounded renderer throttles timers and never
  // loads the lazy cell grid. Force the page lifecycle to 'active'.
  await conn.send('Page.setWebLifecycleState', { state: 'active' }).catch(() => {});
  await conn.evaluate('1+1');

  // Wait for SpreadsheetApp to exist (long docs stream the app in).
  const appDeadline = Date.now() + timeoutMs;
  let names = null;
  while (Date.now() < appDeadline) {
    const r = await conn.evaluate(LIST_SHEETS_FN);
    if (r && r.ok && Array.isArray(r.names) && r.names.length) { names = r.names; break; }
    await sleep(800);
  }
  if (!names) {
    conn.ws.close();
    if (openedTab && !opts.keepTab) await httpGet(`/json/close/${tab.id}`).catch(() => {});
    throw new Error('SpreadsheetApp never exposed a sheet list. Confirm debug Chrome is logged into this workspace and the sheet finished loading.');
  }

  const title = await conn.evaluate('document.title').catch(() => '');
  const states = await conn.evaluate(SHEET_STATES_FN).catch(() => ({}));
  const plan = names.filter(n => (only ? only.has(n) : true) && !skip.has(n));
  const hiddenInfos = plan
    .filter(n => states[n] && states[n].state === 2)
    .map(n => ({ name: n, id: states[n].id, state: 2 }));

  // Strategy: unhide ALL hidden sheets once up front (one tab-strip re-render),
  // read every sheet with the strip stable, then re-hide all at the end. The
  // commit guard ensures none of these state changes ever sync to the server.
  let guardInstalled = false;
  if (hiddenInfos.length) {
    await conn.evaluate(INSTALL_GUARD_FN).catch(() => {});
    guardInstalled = true;
    const r = await setSheetStatesBatch(conn, hiddenInfos, 1);
    process.stderr.write(`unhid ${r.ok}/${hiddenInfos.length} hidden sheet(s) locally (fail=${r.fail})\n`);
    await sleep(2000); // let the tab strip mount all the new tabs
  }

  const sheets = [];
  const report = [];
  try {
    for (let i = 0; i < plan.length; i++) {
      const name = plan[i];
      const tag = states[name] && states[name].state === 2 ? ' (hidden)' : '';
      process.stderr.write(`[${i + 1}/${plan.length}] ${name}${tag} ... `);
      const act = await activateSheet(conn, name, timeoutMs);
      // Always read whatever the grid holds — a load_timeout on a genuinely
      // blank sheet still yields a valid (empty) result.
      await sleep(300);
      const data = await conn.evaluate(readSheetFn(name)).catch(() => null)
        || { name, rows: 0, cols: 0, cells: [], merges: [] };
      sheets.push(data);
      const status = act.activated ? 'ok' : (data.cells.length ? 'ok*' : (act.reason || 'empty'));
      report.push({ name, status, rows: data.rows, cols: data.cols, cells: data.cells.length });
      process.stderr.write(`${status} rows=${data.rows} cols=${data.cols} cells=${data.cells.length}\n`);
    }
  } finally {
    if (guardInstalled) {
      const r = await setSheetStatesBatch(conn, hiddenInfos, 2);
      process.stderr.write(`re-hid ${r.ok}/${hiddenInfos.length} sheet(s) (fail=${r.fail})\n`);
      const g = await conn.evaluate(REMOVE_GUARD_FN).catch(() => null);
      if (g && g.blocked) process.stderr.write(`commit guard blocked ${g.blocked} local mutation(s) (nothing synced)\n`);
    }
  }

  const outputFile = opts.outputFile || (() => {
    fs.mkdirSync(DEFAULT_OUT_DIR, { recursive: true });
    return path.join(DEFAULT_OUT_DIR, `${slugFromUrl(docUrl)}.sheets.json`);
  })();
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  const payload = {
    docUrl, title,
    exportedAt: new Date().toISOString(),
    skipped: names.filter(n => skip.has(n)),
    sheetOrder: plan,
    sheets,
  };
  fs.writeFileSync(outputFile, JSON.stringify(payload), 'utf8');

  conn.ws.close();
  if (openedTab && !opts.keepTab) await httpGet(`/json/close/${tab.id}`).catch(() => {});

  return { outputFile, title, sheetCount: sheets.length, skipped: payload.skipped, report };
}

async function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  function optVal(flag) { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; }
  const outIdx = optVal('--out');
  const skipArg = optVal('--skip');
  const onlyArg = optVal('--only');
  const toArg = optVal('--timeout');
  const positional = args.filter((a, i) => !a.startsWith('--') && !String(args[i - 1] || '').startsWith('--'));
  const docUrlInput = positional[0];

  if (!docUrlInput) {
    console.error('Usage: node scripts/execute/export_wecom_sheet.js <docUrl> [--out f.json] [--skip "a,b"] [--only "a,b"] [--timeout ms] [--json]');
    process.exit(1);
  }
  const opts = { outputFile: outIdx || null, timeoutMs: toArg ? Number(toArg) : undefined };
  if (skipArg !== null) opts.skip = skipArg.split(',').map(s => s.trim()).filter(Boolean);
  if (onlyArg) opts.only = onlyArg.split(',').map(s => s.trim()).filter(Boolean);

  const result = await exportWecomSheet(docUrlInput, opts);
  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(result.outputFile);
    console.error(`title=${result.title} sheets=${result.sheetCount} skipped=[${result.skipped.join(', ')}]`);
  }
}

module.exports = { exportWecomSheet, normalizeDocUrl, slugFromUrl };

if (require.main === module) {
  main().catch(err => { console.error(err.stack || err.message); process.exit(1); });
}
