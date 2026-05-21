const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const ROOT = path.join(__dirname, '..', '..');

function text(value) {
  return String(value ?? '').trim();
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith('--')) continue;
    const key = item.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      options[key] = next;
      i += 1;
    } else {
      options[key] = '1';
    }
  }
  return {
    date: text(options.date || options.today || new Date().toISOString().slice(0, 10)).slice(0, 10),
    outDir: text(options.outDir || ''),
    maxPages: Number(options.maxPages || 200),
  };
}

function dateFolderName(ymd) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) throw new Error(`date must be YYYY-MM-DD: ${ymd}`);
  return `${Number(match[2])}-${Number(match[3])}`;
}

function defaultRawDir(date) {
  return path.join(
    ROOT,
    '黄成喆个人数据趋势',
    '原数据',
    '原日数据',
    dateFolderName(date),
  );
}

function timestamp() {
  const date = new Date();
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const raw = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\r\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

function writeCsv(file, rows = []) {
  const headers = [...rows.reduce((set, row) => {
    if (row && typeof row === 'object') Object.keys(row).forEach(key => set.add(key));
    return set;
  }, new Set())];
  const lines = [headers.map(csvEscape).join(',')];
  for (const row of rows) {
    lines.push(headers.map(header => csvEscape(row?.[header])).join(','));
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `\uFEFF${lines.join('\n')}\n`, 'utf8');
  return { file, rows: rows.length, columns: headers.length, bytes: fs.statSync(file).size };
}

function listTabs() {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9222/json/list', res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', reject);
  });
}

async function findInventoryTab() {
  const tabs = await listTabs();
  const tab = tabs.find(item => String(item.url || '').includes('sellerinventory.yswg.com.cn'));
  if (!tab?.webSocketDebuggerUrl) {
    throw new Error('Cannot find sellerinventory tab on port 9222. Run npm run chrome:debug and log in first.');
  }
  return tab;
}

function evalInTab(ws, expression, timeoutMs = 240000) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1000000000);
    const timer = setTimeout(() => {
      ws.off('message', handler);
      reject(new Error('DevTools evaluation timed out'));
    }, timeoutMs);
    const handler = data => {
      const response = JSON.parse(data);
      if (response.id !== id) return;
      clearTimeout(timer);
      ws.off('message', handler);
      if (response.error) return reject(new Error(JSON.stringify(response.error)));
      const result = response.result?.result;
      if (result?.subtype === 'error') return reject(new Error(result.description || 'DevTools evaluation error'));
      resolve(result?.value);
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({
      id,
      method: 'Runtime.evaluate',
      params: { expression, awaitPromise: true, returnByValue: true },
    }));
  });
}

async function captureAndFetchRows(maxPages = 200) {
  const tab = await findInventoryTab();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise(resolve => ws.on('open', resolve));
  const expression = `
    (async () => {
      const maxPages = ${JSON.stringify(maxPages)};
      const getRows = (json) => {
        if (Array.isArray(json?.data)) return json.data;
        if (Array.isArray(json?.data?.list)) return json.data.list;
        if (Array.isArray(json?.data?.rows)) return json.data.rows;
        if (Array.isArray(json?.data?.data)) return json.data.data;
        if (Array.isArray(json?.rows)) return json.rows;
        if (Array.isArray(json?.list)) return json.list;
        return [];
      };
      const getTotal = (json, fallbackRows = []) => (
        Number(json?.count) ||
        Number(json?.total) ||
        Number(json?.data?.count) ||
        Number(json?.data?.total) ||
        fallbackRows.length
      );
      const frames = [...document.querySelectorAll('iframe')]
        .filter(frame => (frame.src || '').includes('/pm/formal/list?tempid=') && !(frame.src || '').includes('variant_sku'));
      const frame = frames[0] || [...document.querySelectorAll('iframe')].find(item => (item.src || '').includes('/pm/formal/list'));
      if (!frame || !frame.contentWindow || !frame.contentDocument) {
        return JSON.stringify({ ok: false, error: 'inventory list frame not found' });
      }
      const win = frame.contentWindow;
      const doc = frame.contentDocument;
      let captured = null;
      const originalOpen = win.XMLHttpRequest.prototype.open;
      const originalSend = win.XMLHttpRequest.prototype.send;
      const originalSetHeader = win.XMLHttpRequest.prototype.setRequestHeader;
      win.XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        this.__dailyInvMethod = method;
        this.__dailyInvUrl = url;
        this.__dailyInvHeaders = {};
        return originalOpen.call(this, method, url, ...rest);
      };
      win.XMLHttpRequest.prototype.setRequestHeader = function(key, value) {
        this.__dailyInvHeaders = this.__dailyInvHeaders || {};
        this.__dailyInvHeaders[key] = value;
        return originalSetHeader.call(this, key, value);
      };
      win.XMLHttpRequest.prototype.send = function(body) {
        if (String(this.__dailyInvUrl || '').includes('/pm/formal/list')) {
          captured = {
            url: new URL(this.__dailyInvUrl, win.location.href).toString(),
            method: this.__dailyInvMethod || 'POST',
            headers: this.__dailyInvHeaders || {},
            body: typeof body === 'string' ? body : '',
          };
        }
        return originalSend.call(this, body);
      };
      const queryButton = doc.querySelector('input.search_btn') ||
        [...doc.querySelectorAll('input,button,[role="button"],[onclick]')]
          .find(el => (el.value || el.innerText || el.textContent || '').replace(/\\s+/g, '') === '查询');
      if (!queryButton) return JSON.stringify({ ok: false, error: 'query button not found' });
      queryButton.click();
      for (let i = 0; i < 60 && !captured; i += 1) {
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      if (!captured || !captured.body) {
        return JSON.stringify({ ok: false, error: 'inventory list request was not captured' });
      }
      const params = new URLSearchParams(captured.body);
      const limit = Number(params.get('limit') || 50);
      const allRows = [];
      let total = null;
      let pagesFetched = 0;
      for (let page = 1; page <= maxPages; page += 1) {
        params.set('page', String(page));
        params.set('limit', String(limit));
        const res = await win.fetch(captured.url, {
          method: captured.method || 'POST',
          headers: captured.headers,
          body: params.toString(),
          credentials: 'include',
        });
        const bodyText = await res.text();
        if (bodyText.trimStart().startsWith('<')) {
          return JSON.stringify({ ok: false, error: 'inventory backend returned HTML', status: res.status, page });
        }
        let json = null;
        try { json = JSON.parse(bodyText); } catch (error) {
          return JSON.stringify({ ok: false, error: error.message, status: res.status, page, sample: bodyText.slice(0, 500) });
        }
        const rows = getRows(json);
        if (!Array.isArray(rows) || !rows.length) break;
        allRows.push(...rows);
        pagesFetched = page;
        total = getTotal(json, rows);
        if (rows.length < limit) break;
        if (total && allRows.length >= total) break;
      }
      return JSON.stringify({
        ok: true,
        rowCount: allRows.length,
        total,
        limit,
        pagesFetched,
        rows: allRows,
      });
    })()
  `;
  try {
    const raw = await evalInTab(ws, expression, 300000);
    return JSON.parse(raw || '{}');
  } finally {
    ws.close();
  }
}

async function run(options = parseArgs()) {
  const result = await captureAndFetchRows(options.maxPages);
  if (!result.ok || !Array.isArray(result.rows) || !result.rows.length) {
    throw new Error(`inventory recovery failed: ${JSON.stringify({ ok: result.ok, error: result.error, status: result.status, page: result.page, rowCount: result.rowCount })}`);
  }
  const rawDir = options.outDir || defaultRawDir(options.date);
  const csvFile = path.join(rawDir, `inv_auto_filtered_${timestamp()}.csv`);
  const csv = writeCsv(csvFile, result.rows);
  const metaFile = path.join(ROOT, 'data', 'snapshots', `inventory_formal_list_${options.date}.json`);
  fs.mkdirSync(path.dirname(metaFile), { recursive: true });
  fs.writeFileSync(metaFile, JSON.stringify({
    exportedAt: new Date().toISOString(),
    source: '/pm/formal/list',
    date: options.date,
    rowCount: result.rowCount,
    total: result.total,
    limit: result.limit,
    pagesFetched: result.pagesFetched,
    csvFile,
  }, null, 2), 'utf8');
  return {
    ok: true,
    date: options.date,
    source: '/pm/formal/list',
    rowCount: result.rowCount,
    total: result.total,
    pagesFetched: result.pagesFetched,
    csvFile,
    metaFile,
    csv,
  };
}

if (require.main === module) {
  run()
    .then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(error => {
      console.error(error.stack || error.message);
      process.exit(1);
    });
}

module.exports = { run, writeCsv };
