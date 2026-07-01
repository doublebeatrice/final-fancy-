const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const ROOT = path.join(__dirname, '..', '..');
const OUT_DIR = path.join(ROOT, 'data', 'snapshots');
const outputFile = process.argv[2] || path.join(OUT_DIR, `over_budget_rows_${new Date().toISOString().slice(0, 10)}.json`);
const siteId = Number(process.env.SITE_ID || 4);
const limit = Number(process.env.LIMIT || 500);
const maxPages = Number(process.env.MAX_PAGES || 500);
const userName = ['HJ17', 'HJ171', 'HJ172'];

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

async function findAdvTab() {
  const tabs = await listTabs();
  const tab = tabs.find(item => String(item.url || '').includes('adv.yswg.com.cn'));
  if (!tab?.webSocketDebuggerUrl) {
    throw new Error('Cannot find adv.yswg.com.cn tab on port 9222. Open the ad backend in debug Chrome first.');
  }
  return tab;
}

function evalInTab(ws, expression, awaitPromise = false, timeoutMs = 240000) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1000000);
    const timer = setTimeout(() => {
      ws.off('message', handler);
      reject(new Error('DevTools evaluation timed out'));
    }, timeoutMs);
    const handler = data => {
      const response = JSON.parse(data);
      if (response.id !== id) return;
      clearTimeout(timer);
      ws.off('message', handler);
      if (response.error) {
        reject(new Error(JSON.stringify(response.error)));
        return;
      }
      resolve(response.result?.result?.value);
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({
      id,
      method: 'Runtime.evaluate',
      params: { expression, awaitPromise, returnByValue: true },
    }));
  });
}

function formatYmd(date) {
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function makeAdTimeRange(days) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days + 1);
  return [
    new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime(),
    new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1).getTime(),
  ];
}

function makeSbDateRange(days) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days + 1);
  return [formatYmd(start), formatYmd(end)];
}

function makeAdvProductManagePayload() {
  return {
    siteId,
    timeRange: makeAdTimeRange(30),
    state: '4',
    userName,
    level: 'seller_num',
    lowCost: 2,
    page: 1,
    limit,
  };
}

function makeSbCampaignManagePayload() {
  return {
    siteId,
    activeStatus: 'notArchived',
    searchType: '1',
    userName,
    level: 'seller_num',
    selectCampaignDate: makeSbDateRange(30),
    page: 1,
    limit,
    field: 'Spend',
    order: 'desc',
    filterForm: { OutOfBudget: false },
    source: 'new',
  };
}

async function fetchOverBudgetRows() {
  const tab = await findAdvTab();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise(resolve => ws.on('open', resolve));
  const expression = `
    (async () => {
      const limit = ${JSON.stringify(limit)};
      const maxPages = ${JSON.stringify(maxPages)};
      const startedAt = new Date().toISOString();
      const xsrf = document.cookie.match(/(?:^|;\\s*)XSRF-TOKEN=([^;]+)/)?.[1] || '';
      const headers = { 'Content-Type': 'application/json', 'x-xsrf-token': decodeURIComponent(xsrf) };
      const getList = json => json?.data?.records || json?.data?.data || json?.data?.list || json?.data?.rows ||
        json?.records || json?.list || json?.rows || (Array.isArray(json?.data) ? json.data : []);
      async function postJson(url, payload) {
        const res = await fetch(url, { method: 'POST', credentials: 'include', headers, body: JSON.stringify(payload) });
        const text = await res.text();
        if (text.trimStart().startsWith('<')) return { ok: false, status: res.status, error: 'ad backend returned HTML; login/session is not ready', payload };
        try { return { ok: res.ok, status: res.status, payload, json: JSON.parse(text) }; }
        catch (error) { return { ok: false, status: res.status, error: error.message, text: text.slice(0, 1000), payload }; }
      }
      async function fetchPaged(url, basePayload) {
        const rows = [];
        let total = null;
        for (let page = 1; page <= maxPages; page += 1) {
          const response = await postJson(url, { ...basePayload, page, limit });
          if (!response.ok) throw new Error(url + ': ' + (response.error || response.status));
          const list = getList(response.json || {});
          if (!Array.isArray(list) || !list.length) break;
          rows.push(...list);
          total = response.json?.data?.total ?? response.json?.total ?? total;
          if (list.length < limit) break;
          if (total != null && rows.length >= Number(total)) break;
        }
        return rows;
      }
      function variants(basePayload) {
        return [
          { name: 'filterForm.OutOfBudget=true', payload: { ...basePayload, filterForm: { ...(basePayload.filterForm || {}), OutOfBudget: true } } },
          { name: 'topLevel.OutOfBudget=true', payload: { ...basePayload, OutOfBudget: true } },
          { name: 'topLevel.outOfBudget=true', payload: { ...basePayload, outOfBudget: true } },
          { name: 'topLevel.overBudget=true', payload: { ...basePayload, overBudget: true } },
        ];
      }
      async function firstWorking(url, variantList) {
        const attemptedVariants = [];
        let lastError = null;
        for (const variant of variantList) {
          try {
            const rows = await fetchPaged(url, variant.payload);
            attemptedVariants.push({ name: variant.name, ok: true, count: rows.length });
            return { rows, variant: { name: variant.name }, attemptedVariants };
          } catch (error) {
            lastError = error;
            attemptedVariants.push({ name: variant.name, ok: false, error: error.message });
          }
        }
        const error = new Error(lastError?.message || 'all over-budget payload variants failed');
        error.attemptedVariants = attemptedVariants;
        throw error;
      }
      const spBase = ${JSON.stringify(makeAdvProductManagePayload())};
      const sbBase = ${JSON.stringify(makeSbCampaignManagePayload())};
      const settled = await Promise.allSettled([
        firstWorking('/advProduct/all', variants(spBase)),
        firstWorking('/campaignSb/findAllNew', variants(sbBase)),
      ]);
      const spHit = settled[0].status === 'fulfilled' ? settled[0].value : null;
      const sbHit = settled[1].status === 'fulfilled' ? settled[1].value : null;
      const spRows = spHit?.rows || [];
      const sbRows = sbHit?.rows || [];
      const errors = settled.map((result, index) => result.status === 'rejected' ? {
        source: index === 0 ? 'sp_over_budget' : 'sb_over_budget',
        error: result.reason?.message || String(result.reason || ''),
        attemptedVariants: result.reason?.attemptedVariants || [],
      } : null).filter(Boolean);
      const rows = [
        ...spRows.map(row => ({ ...row, __overBudgetSource: 'SP' })),
        ...sbRows.map(row => ({ ...row, __overBudgetSource: 'SB' })),
      ];
      const status = errors.length ? 'partial' : (rows.length ? 'complete' : 'complete_empty');
      const summarize = (sourceRows, source) => ({
        source,
        count: sourceRows.length,
        sampleKeys: Object.keys(sourceRows[0] || {}),
      });
      return JSON.stringify({
        exportedAt: new Date().toISOString(),
        rows,
        meta: {
          endpoint: { sp: '/advProduct/all', sb: '/campaignSb/findAllNew' },
          filters: { sp: spHit?.variant || null, sb: sbHit?.variant || null },
          status,
          attempted: 2,
          failed: errors.length,
          errors,
          startedAt,
          endedAt: new Date().toISOString(),
          sp: { ...summarize(spRows, 'SP'), variant: spHit?.variant || null, attemptedVariants: spHit?.attemptedVariants || [] },
          sb: { ...summarize(sbRows, 'SB'), variant: sbHit?.variant || null, attemptedVariants: sbHit?.attemptedVariants || [] },
        },
      });
    })()
  `;
  try {
    const raw = await evalInTab(ws, expression, true, 360000);
    const result = JSON.parse(raw || '{}');
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    fs.writeFileSync(outputFile, JSON.stringify(result, null, 2), 'utf8');
    return result;
  } finally {
    ws.close();
  }
}

if (require.main === module) {
  fetchOverBudgetRows()
    .then(result => {
      console.log(JSON.stringify({
        outputFile,
        status: result.meta?.status,
        rows: Array.isArray(result.rows) ? result.rows.length : 0,
        sp: result.meta?.sp?.count || 0,
        sb: result.meta?.sb?.count || 0,
        failed: result.meta?.failed || 0,
      }, null, 2));
    })
    .catch(error => {
      console.error(error.stack || error.message);
      process.exit(1);
    });
}

module.exports = { fetchOverBudgetRows };
