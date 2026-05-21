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
  const sellers = text(options.sellers || 'HJ17,HJ171,HJ172')
    .split(/[,\s]+/)
    .map(item => text(item))
    .filter(Boolean);
  return {
    date: text(options.date || options.today || new Date().toISOString().slice(0, 10)).slice(0, 10),
    days: Number(options.days || 7),
    sellers,
    limit: Number(options.limit || 50),
    outDir: text(options.outDir || ''),
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

async function fetchSalesCoreRows(options) {
  const tab = await findInventoryTab();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise(resolve => ws.on('open', resolve));
  const expression = `
    (async () => {
      const args = ${JSON.stringify({
        days: options.days,
        sellers: options.sellers,
        limit: options.limit,
      })};
      const getList = json => (
        Array.isArray(json?.data?.list) ? json.data.list :
        Array.isArray(json?.data?.records) ? json.data.records :
        Array.isArray(json?.data?.data) ? json.data.data :
        Array.isArray(json?.data?.rows) ? json.data.rows :
        Array.isArray(json?.data) ? json.data :
        Array.isArray(json?.rows) ? json.rows :
        Array.isArray(json?.list) ? json.list : []
      );
      const findStorageValue = (patterns, validator = value => !!value) => {
        const stores = [localStorage, sessionStorage];
        for (const store of stores) {
          for (let i = 0; i < store.length; i += 1) {
            const key = store.key(i);
            const value = store.getItem(key);
            if (patterns.some(pattern => pattern.test(key)) && validator(value)) return value;
          }
        }
        for (const store of stores) {
          for (let i = 0; i < store.length; i += 1) {
            const value = store.getItem(store.key(i));
            if (validator(value)) return value;
          }
        }
        return '';
      };
      const csrf =
        document.querySelector('meta[name="csrf-token"]')?.content ||
        document.querySelector('input[name="_token"]')?.value ||
        window.Laravel?.csrfToken ||
        document.cookie.match(/(?:^|;\\s*)XSRF-TOKEN=([^;]+)/)?.[1] ||
        '';
      const jwtToken = localStorage.getItem('jwt_token') ||
        sessionStorage.getItem('jwt_token') ||
        findStorageValue([/jwt/i, /token/i], value => /^eyJ/.test(String(value || '')));
      const referrerFrame = [...document.querySelectorAll('iframe')]
        .map(frame => frame.src || '')
        .find(src => src.includes('/pm/sale/seller_index') || src.includes('Inventory-Token')) || location.href;
      async function fetchPage(page) {
        const body = new URLSearchParams();
        body.set('time', String(args.days || 7));
        for (const seller of args.sellers || []) body.append('seller[]', seller);
        body.set('page', String(page));
        body.set('limit', String(args.limit || 50));
        body.set('field', 'order_sales');
        body.set('order', 'desc');
        const headers = {
          accept: '*/*',
          'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'x-csrf-token': decodeURIComponent(csrf),
          'x-requested-with': 'XMLHttpRequest',
        };
        if (jwtToken) headers['jwt-token'] = jwtToken;
        const res = await fetch('/pm/sale/getBySeller', {
          method: 'POST',
          mode: 'cors',
          credentials: 'include',
          headers,
          referrer: referrerFrame,
          body: body.toString(),
        });
        const text = await res.text();
        if (text.trimStart().startsWith('<')) {
          return { ok: false, error: 'sales core endpoint returned HTML', status: res.status, page };
        }
        let json = null;
        try { json = JSON.parse(text); } catch (error) {
          return { ok: false, error: error.message, status: res.status, page, sample: text.slice(0, 500) };
        }
        return { ok: true, status: res.status, json, rows: getList(json), tokenState: { csrf: !!csrf, jwtToken: !!jwtToken } };
      }
      const first = await fetchPage(1);
      if (!first.ok) return JSON.stringify(first);
      const total = Number(first.json?.count || first.json?.data?.total || first.json?.total || first.rows.length);
      const limit = Number(args.limit || 50);
      const pages = Math.min(Math.ceil(total / limit), 100);
      const rows = [...first.rows];
      for (let page = 2; page <= pages; page += 1) {
        const hit = await fetchPage(page);
        if (!hit.ok) return JSON.stringify(hit);
        rows.push(...hit.rows);
        if (!hit.rows.length || hit.rows.length < limit) break;
      }
      return JSON.stringify({
        ok: true,
        rows,
        total,
        pagesFetched: pages,
        endpoint: '/pm/sale/getBySeller',
        tokenState: first.tokenState,
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
  const result = await fetchSalesCoreRows(options);
  if (!result.ok || !Array.isArray(result.rows) || !result.rows.length) {
    throw new Error(`sales core recovery failed: ${JSON.stringify({ ok: result.ok, error: result.error, status: result.status, page: result.page, rowCount: result.rows?.length })}`);
  }
  const rawDir = options.outDir || defaultRawDir(options.date);
  const csvFile = path.join(rawDir, `seller_sales_core_${options.days}d_${options.date}.csv`);
  const jsonFile = path.join(rawDir, `seller_sales_core_${options.days}d_${options.date}.json`);
  const payload = {
    exportedAt: new Date().toISOString(),
    source: '/pm/sale/getBySeller',
    date: options.date,
    days: options.days,
    sellers: options.sellers,
    rowCount: result.rows.length,
    total: result.total,
    pagesFetched: result.pagesFetched,
    rows: result.rows,
  };
  fs.mkdirSync(rawDir, { recursive: true });
  fs.writeFileSync(jsonFile, JSON.stringify(payload, null, 2), 'utf8');
  const csv = writeCsv(csvFile, result.rows);
  return {
    ok: true,
    date: options.date,
    source: payload.source,
    rowCount: result.rows.length,
    total: result.total,
    pagesFetched: result.pagesFetched,
    csvFile,
    jsonFile,
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

module.exports = {
  run,
  writeCsv,
};
