const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const {
  buildKeywordPlacementReport,
  readAsinsFromSnapshot,
  splitList,
} = require('../../src/ad_keyword_placement');

const ROOT = path.join(__dirname, '..', '..');
const OUT_DIR = path.join(ROOT, 'data', 'snapshots');

function formatYmd(date) {
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function defaultDateRange(daysBack) {
  const end = new Date();
  end.setDate(end.getDate() - 1);
  const start = new Date(end);
  start.setDate(start.getDate() - daysBack + 1);
  return [formatYmd(start), formatYmd(end)];
}

function isYmd(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function getArg(argv, name, fallback = '') {
  const index = argv.indexOf(name);
  if (index < 0) return fallback;
  return argv[index + 1] || '';
}

function hasFlag(argv, name) {
  return argv.includes(name);
}

function parseArgs(argv = process.argv) {
  const args = argv.slice(2);
  const sku = String(getArg(args, '--sku', '')).trim().toUpperCase();
  const terms = splitList(getArg(args, '--terms', getArg(args, '--term', '')));
  const asins = splitList(getArg(args, '--asin', getArg(args, '--asins', ''))).map(value => value.toUpperCase());
  const adGroupIds = splitList(getArg(args, '--ad-group-id', getArg(args, '--ad-group-ids', '')));
  const siteId = Number(getArg(args, '--site-id', process.env.SITE_ID || 4));
  const days = getArg(args, '--days', process.env.DAYS || '30');
  const start = getArg(args, '--start', process.env.DATE_START || '');
  const end = getArg(args, '--end', process.env.DATE_END || '');
  const dateRange = isYmd(start) && isYmd(end) ? [start, end] : defaultDateRange(Number(days || 30));
  const snapshot = getArg(args, '--snapshot', path.join(ROOT, 'data', 'snapshots', 'latest_snapshot.json'));
  const today = new Date().toISOString().slice(0, 10);
  const subject = sku || terms[0] || asins[0] || adGroupIds[0] || 'keyword_placement';
  const outputFile = getArg(args, '--out', path.join(OUT_DIR, `ad_keyword_placement_${subject.replace(/[^a-z0-9_-]+/gi, '_')}_${today}.json`));

  return {
    sku,
    terms,
    asins,
    adGroupIds,
    siteId,
    dateRange,
    days: isYmd(start) ? null : Number(days || 30),
    snapshot,
    outputFile,
    includeRelated: hasFlag(args, '--include-related'),
    includeTrend: !hasFlag(args, '--no-trend'),
    currentPageFallback: !hasFlag(args, '--no-current-page-fallback'),
    limit: Number(getArg(args, '--limit', 500)),
    pageLimit: Number(getArg(args, '--page-limit', 3)),
  };
}

function usage() {
  return [
    'Usage: npm run ops:ad:keyword-placement -- --sku <SKU> --terms "<term1, term2>" [--asin <ASIN>] [--days 30]',
    '   or: node scripts/execute/fetch_ad_keyword_placement.js --ad-group-id <id> --asin <ASIN> --terms "<term>"',
  ].join('\n');
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

async function findAdvTab() {
  const tabs = await listTabs();
  const tab = tabs.find(item => String(item.url || '').includes('adv.yswg.com.cn'));
  if (!tab?.webSocketDebuggerUrl) {
    throw new Error('Cannot find adv.yswg.com.cn tab on port 9222. Run npm run chrome:ready and open the ad backend first.');
  }
  return tab;
}

function evalInTab(ws, expression, awaitPromise = false) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1000000);
    const timer = setTimeout(() => {
      ws.off('message', handler);
      reject(new Error('DevTools evaluation timed out'));
    }, 120000);
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

function completeAsins(options) {
  const asins = [...options.asins];
  if (!asins.length && options.sku) {
    asins.push(...readAsinsFromSnapshot(options.snapshot, options.sku));
  }
  return [...new Set(asins.map(value => String(value || '').trim().toUpperCase()).filter(Boolean))];
}

async function fetchLivePlacement(options) {
  const asins = completeAsins(options);
  const tab = await findAdvTab();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise(resolve => ws.on('open', resolve));

  const expression = `
    (async () => {
      const options = ${JSON.stringify({ ...options, asins })};
      const xsrf = document.cookie.match(/(?:^|;\\s*)XSRF-TOKEN=([^;]+)/)?.[1] || '';
      const headers = {
        'Content-Type': 'application/json',
        'x-xsrf-token': decodeURIComponent(xsrf),
      };
      const selectDate = options.dateRange;
      const timeRange = [
        new Date(selectDate[0] + 'T00:00:00').getTime(),
        new Date(new Date(selectDate[1] + 'T00:00:00').getTime() + 86400000).getTime()
      ];
      const lower = value => String(value || '').trim().toLowerCase();
      const wantedTerms = (options.terms || []).map(lower).filter(Boolean);
      const wantedSku = lower(options.sku);
      const wantedAdGroupIds = new Set((options.adGroupIds || []).map(value => String(value || '').trim()).filter(Boolean));
      async function postJson(path, payload) {
        const res = await fetch(path, { method: 'POST', credentials: 'include', headers, body: JSON.stringify(payload) });
        const text = await res.text();
        if (text.trimStart().startsWith('<')) return { ok: false, status: res.status, error: 'ad backend returned HTML; login/session is not ready', payload };
        try { return { ok: res.ok, status: res.status, payload, json: JSON.parse(text) }; }
        catch (error) { return { ok: false, status: res.status, error: error.message, text: text.slice(0, 1000), payload }; }
      }
      function getList(json) {
        return json?.data?.records || json?.data?.data || json?.data?.list || json?.data?.rows ||
          json?.records || json?.list || json?.rows || (Array.isArray(json?.data) ? json.data : []);
      }
      function matchesRequested(row) {
        const term = lower(row.keywordText || row.keyword || row.searchTerm);
        const skuHit = !wantedSku || [row.sku, row.campaignName, row.groupName].some(value => lower(value).includes(wantedSku));
        const groupHit = !wantedAdGroupIds.size || wantedAdGroupIds.has(String(row.adGroupId || ''));
        const termHit = !wantedTerms.length || wantedTerms.some(wanted => options.includeRelated ? term.includes(wanted) : term === wanted);
        return skuHit && groupHit && termHit;
      }
      async function fetchKeywordRowsForTerm(term) {
        const rows = [];
        const pages = [];
        for (let page = 1; page <= Math.max(1, Number(options.pageLimit || 3)); page += 1) {
          const payload = {
            accountId: '',
            siteId: options.siteId,
            timeRange,
            state: '4',
            coreMark: '0',
            userName: ['HJ17', 'HJ171', 'HJ172'],
            level: 'seller_num',
            publicAdv: '2',
            lowCost: 2,
            name: term || '',
            queryType: '',
            field: 'Spend',
            order: 'desc',
            page,
            limit: Math.max(1, Number(options.limit || 500)),
            property: '1',
            filterArray: { campaignState: '1' },
            filterForm: { campaignState: '1' },
          };
          const response = await postJson('/keyword/findAllNew', payload);
          const list = getList(response.json || {});
          pages.push({ term, page, ok: response.ok, status: response.status, rowCount: list.length, total: response.json?.count ?? null, error: response.error || null });
          if (page === 1 && !response.ok) break;
          rows.push(...list);
          if (list.length < payload.limit) break;
        }
        return { rows, pages };
      }
      function currentKeywordRows() {
        if (!options.currentPageFallback) return [];
        const seen = new Set();
        const components = [];
        function walk(vm) {
          if (!vm || seen.has(vm)) return;
          seen.add(vm);
          components.push(vm);
          for (const child of vm.$children || []) walk(child);
        }
        for (const el of document.querySelectorAll('*')) if (el.__vue__) walk(el.__vue__);
        const out = [];
        for (const vm of components) {
          const rows = vm.$options?.name === 'KeywordManage' && Array.isArray(vm.tableData) ? vm.tableData : [];
          for (const row of rows) if (matchesRequested(row)) out.push(row);
        }
        return out;
      }
      const allRows = [];
      const pages = [];
      if (wantedTerms.length) {
        for (const term of wantedTerms) {
          const result = await fetchKeywordRowsForTerm(term);
          allRows.push(...result.rows);
          pages.push(...result.pages);
        }
      }
      const currentRows = currentKeywordRows();
      allRows.push(...currentRows);
      const byKey = new Map();
      for (const row of allRows.filter(matchesRequested)) {
        const key = [row.keywordId, row.adGroupId, row.keywordText || row.keyword || row.searchTerm].map(value => String(value || '')).join('::');
        if (!byKey.has(key)) byKey.set(key, row);
      }
      const keywordRows = [...byKey.values()];
      const adGroupIds = [...new Set([
        ...keywordRows.filter(row => Number(row.keywordPosition) === 1).map(row => String(row.adGroupId || '')).filter(Boolean),
        ...(options.adGroupIds || []).map(value => String(value || '')).filter(Boolean),
      ])];
      let placement = { ok: false, skipped: true, reason: 'missing adGroupIds or asins' };
      if (adGroupIds.length && (options.asins || []).length) {
        placement = await postJson('/keyword/getKeywordsOfPlacementByAdGroups', { adGroupIds, asins: options.asins });
      }
      const trendByKey = {};
      if (options.includeTrend && (options.asins || []).length) {
        for (const row of keywordRows) {
          const term = row.keywordText || row.keyword || row.searchTerm || '';
          if (!term || !row.adGroupId) continue;
          for (const asin of options.asins) {
            const trend = await postJson('/keyword/getKeywordsOfPlacementTrend', { searchTerm: term, asin, adGroupId: row.adGroupId });
            const key = [String(row.adGroupId || ''), String(asin || ''), lower(term)].join('::');
            trendByKey[key] = Array.isArray(trend.json?.data) ? trend.json.data : [];
          }
        }
      }
      return JSON.stringify({
        href: location.href,
        keywordRows,
        pages,
        currentPageFallbackRowCount: currentRows.length,
        placementData: placement.json?.data || {},
        placementStatus: { ok: placement.ok, status: placement.status || null, skipped: placement.skipped || false, reason: placement.reason || '', error: placement.error || '' },
        trendByKey,
        asins: options.asins,
      });
    })()
  `;

  const raw = await evalInTab(ws, expression, true);
  ws.close();
  return JSON.parse(raw || '{}');
}

async function main() {
  const options = parseArgs(process.argv);
  if (!options.terms.length && !options.adGroupIds.length) {
    throw new Error(usage());
  }
  const live = await fetchLivePlacement(options);
  const warnings = [];
  if (!live.asins?.length) warnings.push('missing_asin: pass --asin or provide a latest_snapshot.json with sku->asin mapping');
  if (live.placementStatus?.skipped) warnings.push(`placement_fetch_skipped: ${live.placementStatus.reason}`);
  if (live.placementStatus?.error) warnings.push(`placement_fetch_error: ${live.placementStatus.error}`);

  const report = buildKeywordPlacementReport({
    generatedAt: new Date().toISOString(),
    request: {
      sku: options.sku,
      terms: options.terms,
      asins: live.asins || [],
      adGroupIds: options.adGroupIds,
      siteId: options.siteId,
      dateRange: options.dateRange,
      includeRelated: options.includeRelated,
      includeTrend: options.includeTrend,
      snapshot: options.snapshot,
    },
    keywordRows: live.keywordRows || [],
    placementData: live.placementData || {},
    trendByKey: live.trendByKey || {},
    asins: live.asins || [],
    warnings,
  });
  report.liveContext = {
    href: live.href,
    keywordPages: live.pages || [],
    currentPageFallbackRowCount: live.currentPageFallbackRowCount || 0,
    placementStatus: live.placementStatus || {},
  };

  fs.mkdirSync(path.dirname(options.outputFile), { recursive: true });
  fs.writeFileSync(options.outputFile, JSON.stringify(report, null, 2), 'utf8');
  return { report, outputFile: options.outputFile };
}

if (require.main === module) {
  main()
    .then(({ report, outputFile }) => {
      console.log(JSON.stringify({
        outputFile,
        request: report.request,
        coverage: report.coverage,
        warnings: report.warnings,
        sample: report.rows[0] || null,
      }, null, 2));
    })
    .catch(error => {
      console.error(error.stack || error.message);
      process.exit(1);
    });
}

module.exports = {
  parseArgs,
  fetchLivePlacement,
};
