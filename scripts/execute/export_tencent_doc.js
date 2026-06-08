#!/usr/bin/env node
'use strict';

/**
 * Export the full text of a Tencent Docs / WeCom (企业微信) document that is
 * rendered to <canvas> and/or has copy disabled for view-only members.
 *
 * Why this exists: these docs paint the body onto a <canvas>, so the DOM holds
 * no body text, and "禁止仅浏览成员复制" blocks select-all + copy. We bypass both
 * by reading the melo editor's in-memory document box tree (the same source the
 * canvas is drawn from) over the Chrome DevTools Protocol.
 *
 * Usage:
 *   node scripts/execute/export_tencent_doc.js <docUrl> [outFile]
 *   node scripts/execute/export_tencent_doc.js <docUrl> --json
 *
 * Requires the project debug Chrome on port 9222 (npm run chrome:ready),
 * logged into the doc's workspace.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const DEBUG_PORT = Number(process.env.AD_OPS_CHROME_DEBUG_PORT || 9222);
const DEBUG_HOST = '127.0.0.1';
const PROJECT_ROOT = path.join(__dirname, '..', '..');
const DEFAULT_OUT_DIR = path.join(PROJECT_ROOT, 'data', 'doc_exports');

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

// Open a fresh tab on the doc URL. PUT /json/new is the documented verb; some
// builds only accept GET, so fall back to it.
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
  const m = url.match(/\/doc\/([A-Za-z0-9_-]+)/) || url.match(/\/([A-Za-z0-9_-]{6,})(?:\?|$)/);
  return (m && m[1]) ? m[1].slice(0, 40) : 'tencent_doc';
}

function normalizeBody(raw, title) {
  const text = String(raw || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(s => s.replace(/​/g, '').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+/, '');
  const header = title ? `# ${title}\n\n` : '';
  return header + text;
}

// Walks the melo editor document box tree and returns the raw joined text.
// Runs inside the page via Runtime.evaluate.
const EXTRACT_FN = `(() => {
  const editor = window.pad
    && window.pad.option
    && window.pad.option.container
    && window.pad.option.container.editor;
  if (!editor || typeof editor.getDocumentBox !== 'function') {
    return { ready: false, reason: 'editor_not_ready' };
  }
  const root = editor.getDocumentBox();
  if (!root) return { ready: false, reason: 'no_document_box' };
  const seen = new WeakSet();
  const parts = [];
  const textProps = ['text', 'char', 'content', 'str', 'value', '_text', 'data'];
  const childProps = ['childBoxes', 'children', 'boxes', '_childBoxes', 'content'];
  function visit(box, depth) {
    if (!box || typeof box !== 'object' || seen.has(box) || depth > 80) return;
    seen.add(box);
    for (const k of textProps) {
      try { const v = box[k]; if (typeof v === 'string' && v.length) parts.push(v); } catch (e) {}
    }
    for (const ck of childProps) {
      let arr; try { arr = box[ck]; } catch (e) { continue; }
      if (Array.isArray(arr)) for (const c of arr) visit(c, depth + 1);
    }
  }
  visit(root, 0);
  const raw = parts.join('');
  let title = '';
  try { title = (editor.getTitleContentInfo() || {}).content || ''; } catch (e) {}
  if (!title) title = document.title || '';
  let blocked = false;
  try {
    blocked = String(getSelection() || '').includes('已禁止') ||
      !!(window.pad.permissionCtrl && window.pad.permissionCtrl.privilege && window.pad.permissionCtrl.privilege.isBlocked);
  } catch (e) {}
  return { ready: true, raw, title, wordCount: raw.replace(/[\\r\\n]/g, '').length, copyBlocked: blocked };
})()`;

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
    // Page.captureScreenshot occasionally never replies on melo redraws; guard it.
    return Promise.race([
      base,
      new Promise((_, rej) => setTimeout(() => { pending.delete(id); rej(new Error('cdp timeout: ' + method)); }, timeoutMs)),
    ]);
  }
  async function evaluate(expression) {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) {
      const ex = r.result.exceptionDetails.exception || r.result.exceptionDetails;
      throw new Error(`page eval failed: ${JSON.stringify(ex).slice(0, 300)}`);
    }
    return r.result && r.result.result && r.result.result.value;
  }
  return { ws, ready, send, evaluate };
}

/**
 * Capture each rendered page of a canvas doc to a PNG. melo paints the body to
 * <canvas> and most diagrams/charts are vector-drawn into it (no downloadable
 * image URL), so a page screenshot is the only faithful way to keep the visuals.
 * Returns { dir, pages: [{index, file, bytes}], failures: [index...] }.
 */
async function capturePages(conn, opts) {
  const { send, evaluate } = conn;
  const outDir = opts.pagesDir;
  const scale = opts.scale || 1;
  fs.mkdirSync(outDir, { recursive: true });

  await send('Page.enable').catch(() => {});
  // melo pauses canvas repainting while the tab is backgrounded, which yields blank
  // screenshots. Bring the doc tab to front so the canvas actually paints.
  await send('Page.bringToFront').catch(() => {});

  // Tall viewport so a full A4 page fits in one shot; scale 1 keeps transfers fast.
  await send('Emulation.setDeviceMetricsOverride', { width: 1100, height: 1200, deviceScaleFactor: scale, mobile: false });
  await sleep(1200); // allow melo to reflow into the narrowed viewport

  // Poll for the page geometry — after a viewport change melo briefly re-mounts
  // its canvas, so the first query can return null.
  const geoExpr = `(() => {
    const sc = document.querySelector('#scrollable');
    const c = document.querySelector('canvas.melo-page-main-view');
    if (!sc || !c) return null;
    const cr = c.getBoundingClientRect();
    const sr = sc.getBoundingClientRect();
    return { docX: Math.round(cr.x), docW: Math.round(cr.width), scY: Math.round(sr.y), scrollH: sc.scrollHeight };
  })()`;
  let geo = null;
  for (let i = 0; i < 10 && !geo; i++) {
    try { geo = await evaluate(geoExpr); } catch (_) { geo = null; }
    if (!geo) await sleep(600);
  }
  if (!geo) {
    await send('Emulation.clearDeviceMetricsOverride').catch(() => {});
    return { dir: outDir, pages: [], failures: [], reason: 'no_canvas_for_pages' };
  }

  const pageH = 1101; // A4 page height melo uses
  const totalPages = Math.max(1, Math.ceil(geo.scrollH / pageH));
  const pages = [];
  const failures = [];

  async function shoot(i) {
    const y = i * pageH;
    await send('Runtime.evaluate', { expression: `document.querySelector('#scrollable').scrollTo(0, ${y}); true`, returnByValue: true }, 8000);
    await sleep(550); // let melo paint the page canvas
    const clip = { x: geo.docX, y: geo.scY, width: geo.docW, height: pageH, scale: 1 };
    const shot = await send('Page.captureScreenshot', { format: 'png', clip, captureBeyondViewport: false }, 20000);
    const b64 = shot.result && shot.result.data;
    if (!b64) throw new Error('no screenshot data');
    const file = path.join(outDir, `page-${String(i + 1).padStart(3, '0')}.png`);
    const buf = Buffer.from(b64, 'base64');
    fs.writeFileSync(file, buf);
    return { index: i + 1, file, bytes: buf.length };
  }

  for (let i = 0; i < totalPages; i++) {
    let ok = null;
    for (let attempt = 0; attempt < 2 && !ok; attempt++) {
      try { ok = await shoot(i); } catch (_) { /* retry once on timeout/redraw */ }
    }
    if (ok) pages.push(ok);
    else failures.push(i + 1);
  }

  await send('Emulation.clearDeviceMetricsOverride').catch(() => {});
  return { dir: outDir, pages, failures, totalPages };
}

/**
 * @param {string} docUrlInput  Doc URL (may be wrapped in quotes/markdown).
 * @param {object} [opts]
 * @param {string} [opts.outputFile]  Where to write. Defaults under data/doc_exports/.
 * @param {boolean} [opts.reuseTab]   Reuse an already-open tab on this URL instead of opening one.
 * @param {boolean} [opts.keepTab]    Leave the tab open after export (default: close the tab we opened).
 * @param {number}  [opts.timeoutMs]  Max time to wait for the body to render. Default 60s.
 * @param {boolean} [opts.pages]      Also capture each rendered page to a PNG (keeps diagrams/charts).
 * @param {string}  [opts.pagesDir]   Where page PNGs go. Default: "<output basename>_pages".
 * @param {number}  [opts.scale]      Device scale factor for page PNGs (1 = fast, 2 = crisp). Default 1.
 */
async function exportTencentDoc(docUrlInput, opts = {}) {
  const docUrl = normalizeDocUrl(docUrlInput);
  const timeoutMs = opts.timeoutMs || 60000;

  // Find or open the target tab.
  const tabs = await listTabs();
  let tab = (opts.reuseTab !== false)
    ? tabs.find(t => t.type === 'page' && t.url && t.url.split('#')[0].startsWith(docUrl.split('?')[0]))
    : null;
  let openedTab = false;
  if (!tab) {
    tab = await openTab(docUrl);
    openedTab = true;
  }
  if (!tab || !tab.webSocketDebuggerUrl) {
    throw new Error('Could not open or attach to a tab for the doc. Is debug Chrome on port ' + DEBUG_PORT + '?');
  }

  const { ws, ready, send, evaluate } = connectPage(tab.webSocketDebuggerUrl);
  await ready;
  await evaluate('1+1'); // warm up runtime

  // Poll until the melo editor has a populated box tree and the word count
  // stabilizes (long docs stream content in).
  const deadline = Date.now() + timeoutMs;
  let last = null;
  let stable = 0;
  while (Date.now() < deadline) {
    let info;
    try { info = await evaluate(EXTRACT_FN); } catch (_) { info = null; }
    if (info && info.ready && info.wordCount > 0) {
      if (last && info.wordCount === last.wordCount) {
        stable += 1;
        if (stable >= 3) { last = info; break; }
      } else {
        stable = 0;
      }
      last = info;
    }
    await sleep(1200);
  }

  if (!last || !last.ready || !last.wordCount) {
    ws.close();
    if (openedTab && !opts.keepTab) await httpGet(`/json/close/${tab.id}`).catch(() => {});
    throw new Error(
      'Failed to extract document body. The editor never exposed a populated box tree. ' +
      'Confirm the debug Chrome is logged into this doc\'s workspace and the page finished loading.'
    );
  }

  const body = normalizeBody(last.raw, last.title);

  const outputFile = opts.outputFile || (() => {
    fs.mkdirSync(DEFAULT_OUT_DIR, { recursive: true });
    return path.join(DEFAULT_OUT_DIR, `${slugFromUrl(docUrl)}.md`);
  })();
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });

  // Optionally capture per-page PNGs (the only faithful way to keep canvas-drawn
  // diagrams/charts that have no downloadable image URL).
  let pageResult = null;
  if (opts.pages) {
    const base = outputFile.replace(/\.[^.]+$/, '');
    const pagesDir = opts.pagesDir || `${base}_pages`;
    try {
      pageResult = await capturePages({ ws, ready, send, evaluate }, { pagesDir, scale: opts.scale || 1 });
    } catch (e) {
      pageResult = { dir: pagesDir, pages: [], failures: [], error: e.message };
    }
  }

  let finalBody = body;
  if (pageResult && pageResult.pages && pageResult.pages.length) {
    const rel = path.basename(pageResult.dir);
    const gallery = pageResult.pages
      .map(p => `![page ${p.index}](${rel}/${path.basename(p.file)})`)
      .join('\n\n');
    finalBody = `${body}\n\n---\n\n## 页面图像（含图表/思维导图，逐页截图）\n\n${gallery}\n`;
  }
  fs.writeFileSync(outputFile, finalBody, 'utf8');

  ws.close();
  if (openedTab && !opts.keepTab) await httpGet(`/json/close/${tab.id}`).catch(() => {});

  return {
    outputFile,
    title: last.title,
    wordCount: last.wordCount,
    charCount: finalBody.length,
    copyBlocked: last.copyBlocked,
    reusedTab: !openedTab,
    docUrl,
    pages: pageResult
      ? { dir: pageResult.dir, captured: pageResult.pages.length, total: pageResult.totalPages || null, failures: pageResult.failures }
      : null,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const keepTab = args.includes('--keep-tab');
  const pages = args.includes('--pages') || args.includes('--images');
  const scaleIdx = args.indexOf('--scale');
  const scale = scaleIdx >= 0 ? Number(args[scaleIdx + 1]) || 1 : 1;
  const positional = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--scale');
  const docUrlInput = positional[0];
  const outputFile = positional[1];

  if (!docUrlInput) {
    console.error('Usage: node scripts/execute/export_tencent_doc.js <docUrl> [outFile] [--pages] [--scale N] [--json] [--keep-tab]');
    process.exit(1);
  }

  const result = await exportTencentDoc(docUrlInput, { outputFile, keepTab, pages, scale });
  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(result.outputFile);
    let info = `title=${result.title} words=${result.wordCount} chars=${result.charCount} ` +
      `copyBlocked=${result.copyBlocked} reusedTab=${result.reusedTab}`;
    if (result.pages) {
      info += ` pages=${result.pages.captured}/${result.pages.total}`;
      if (result.pages.failures && result.pages.failures.length) info += ` failedPages=${result.pages.failures.join(',')}`;
    }
    console.error(info);
  }
}

module.exports = { exportTencentDoc, normalizeDocUrl, normalizeBody, slugFromUrl };

if (require.main === module) {
  main().catch(err => {
    console.error(err.stack || err.message);
    process.exit(1);
  });
}
