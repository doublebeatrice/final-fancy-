const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const ROOT = path.join(__dirname, '..', '..');
const OUT_FILE = path.join(ROOT, 'data', 'actions', 'ka1744_controlled_reopen_2026-06-11.json');

const execute = process.argv.includes('--execute');
const nowIso = () => new Date().toISOString();

const CONFIG = {
  sku: 'KA1744',
  asin: 'B095PD36W7',
  siteId: 4,
  accountId: 135,
  campaignId: '406562323140170',
  adGroupId: '513483161075504',
  adId: '467628634698532',
  targetId: '538448540284366',
  dateRange: ['2026-03-13', '2026-06-10'],
};

function listTabs() {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9222/json/list', res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
      });
    }).on('error', reject);
  });
}

async function findAdvTab() {
  const tabs = await listTabs();
  const tab = tabs.find(item => String(item.url || '').includes('adv.yswg.com.cn'));
  if (!tab?.webSocketDebuggerUrl) throw new Error('Cannot find adv.yswg.com.cn tab on port 9222.');
  return tab;
}

function evalInTab(ws, expression, awaitPromise = false) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1000000);
    const timer = setTimeout(() => {
      ws.off('message', handler);
      reject(new Error('Runtime.evaluate timeout'));
    }, 120000);
    const handler = data => {
      const response = JSON.parse(data);
      if (response.id !== id) return;
      clearTimeout(timer);
      ws.off('message', handler);
      if (response.error) return reject(new Error(JSON.stringify(response.error)));
      const exception = response.result?.exceptionDetails;
      if (exception) return reject(new Error(exception.exception?.description || exception.text));
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

function requests() {
  const { siteId, accountId, campaignId, adGroupId, adId } = CONFIG;
  return [
    {
      name: 'enableCampaign',
      method: 'PATCH',
      path: '/campaign/batchCampaign',
      body: {
        siteId,
        accountId,
        column: 'state',
        property: 'campaign',
        operation: 'state',
        batchType: 'state',
        batchValue: [1],
        columnVal: [1],
        value: 'enabled',
        campaignIdArray: [campaignId],
        batch_campaigns: [campaignId],
        idArray: [campaignId],
        campaignNewArray: [{ siteId, accountId, campaignId, state: 1, campaignState: 1 }],
      },
    },
    {
      name: 'enableAdGroup',
      method: 'PATCH',
      path: '/advGroup/editGroupColumn',
      body: {
        siteId,
        accountId,
        campaignId,
        adGroupId: [adGroupId],
        key: 'state',
        value: 'enabled',
        property: 'group',
        groupIdArray: [adGroupId],
        campaignIdArray: [campaignId],
        operation: 'state',
        groupNewArray: [{ siteId, accountId, campaignId, adGroupId, state: 1 }],
      },
    },
    {
      name: 'enableProductAd',
      method: 'PATCH',
      path: '/advProduct/batchProduct',
      body: {
        siteId,
        accountId,
        column: 'state',
        value: 'enabled',
        products: [adId],
        property: 'product',
        idArray: [adId],
        operation: 'state',
        campaignIdArray: [campaignId],
        productNewArray: [{ siteId, accountId, campaignId, adGroupId, adId, state: 1 }],
      },
    },
  ];
}

async function main() {
  const tab = await findAdvTab();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise(resolve => ws.on('open', resolve));

  const expression = `
    (async () => {
      const execute = ${JSON.stringify(execute)};
      const config = ${JSON.stringify(CONFIG)};
      const requests = ${JSON.stringify(requests())};
      const xsrf = document.cookie.match(/(?:^|;\\s*)XSRF-TOKEN=([^;]+)/)?.[1] || '';
      const headers = {
        'Content-Type': 'application/json',
        'x-xsrf-token': decodeURIComponent(xsrf),
      };
      const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
      const getList = json => json?.data?.records || json?.data?.data || json?.data?.list ||
        json?.data?.rows || json?.records || json?.list || json?.rows ||
        (Array.isArray(json?.data) ? json.data : []);
      async function callJson(req) {
        const res = await fetch(req.path, {
          method: req.method || 'POST',
          credentials: 'include',
          headers,
          body: JSON.stringify(req.body),
        });
        const text = await res.text();
        let json = null;
        try { json = JSON.parse(text); } catch (_) {}
        return {
          name: req.name,
          path: req.path,
          method: req.method,
          httpStatus: res.status,
          ok: res.ok && (json?.code === 200 || json?.msg === 'success'),
          responseCode: json?.code ?? null,
          responseMsg: json?.msg || '',
          response: json || { text: text.slice(0, 500) },
        };
      }
      async function postJson(path, payload) {
        const res = await fetch(path, { method: 'POST', credentials: 'include', headers, body: JSON.stringify(payload) });
        const text = await res.text();
        let json = null;
        try { json = JSON.parse(text); } catch (_) {}
        return { path, httpStatus: res.status, ok: res.ok, json: json || { text: text.slice(0, 500) } };
      }
      async function getJson(path, query) {
        const url = new URL(path, location.origin);
        for (const [key, value] of Object.entries(query)) {
          if (Array.isArray(value)) value.forEach(item => url.searchParams.append(key + '[]', item));
          else url.searchParams.set(key, value);
        }
        const res = await fetch(url.toString(), { method: 'GET', credentials: 'include', headers: { 'x-xsrf-token': decodeURIComponent(xsrf) } });
        const text = await res.text();
        let json = null;
        try { json = JSON.parse(text); } catch (_) {}
        return { path, httpStatus: res.status, ok: res.ok, json: json || { text: text.slice(0, 500) } };
      }
      async function readback() {
        const timeRange = [
          new Date(config.dateRange[0] + 'T00:00:00').getTime(),
          new Date(new Date(config.dateRange[1] + 'T00:00:00').getTime() + 86400000).getTime(),
        ];
        const productPayload = {
          selectDate: config.dateRange,
          mode: 1,
          state: 1,
          siteId: config.siteId,
          sku: config.sku,
          userName: ['HJ17', 'HJ171', 'HJ172'],
          level: 'seller_num',
          field: 'Spend',
          order: 'desc',
          page: 1,
          limit: 500,
        };
        const targetPayload = {
          siteId: config.siteId,
          timeRange,
          state: '4',
          coreMark: '0',
          userName: ['HJ17', 'HJ171', 'HJ172'],
          level: 'seller_num',
          publicAdv: '2',
          lowCost: 2,
          accountId: String(config.accountId),
          campaignId: config.campaignId,
          adGroupId: config.adGroupId,
          property: '2',
          tableName: 'product_target',
          selectDate: config.dateRange,
          field: 'Spend',
          order: 'desc',
          page: 1,
          limit: 500,
          filterArray: { campaignState: '4' },
        };
        const groupQuery = {
          campaignId: config.campaignId,
          accountId: config.accountId,
          siteId: config.siteId,
          groupState: 4,
          selectDate: config.dateRange,
          field: 'Spend',
          order: 'desc',
          page: 1,
          limit: 500,
        };
        const [productResult, targetResult, groupResult] = await Promise.all([
          postJson('/product/adProductData', productPayload),
          postJson('/keyword/findAllNew', targetPayload),
          getJson('/advGroup/findGroupByCampaign', groupQuery),
        ]);
        const productRows = getList(productResult.json || {});
        const targetRows = getList(targetResult.json || {});
        const groupRows = getList(groupResult.json || {});
        return {
          productAd: productRows.find(row => String(row.adId || row.ad_id || row.id || '') === config.adId) || null,
          autoTargets: targetRows
            .filter(row => String(row.campaignId || '') === config.campaignId && String(row.adGroupId || '') === config.adGroupId)
            .map(row => ({
              targetId: String(row.targetId || row.target_id || row.id || ''),
              targetText: row.targetText || row.expression || row.keywordText || '',
              state: row.state,
              bid: row.bid,
              campaignState: row.campaignState,
              groupState: row.groupState,
              Impressions: row.Impressions,
              Clicks: row.Clicks,
              Spend: row.Spend,
              Orders: row.Orders,
              Sales: row.Sales,
              ACOS: row.ACOS,
            })),
          adGroup: groupRows.find(row => String(row.adGroupId || row.ad_group_id || '') === config.adGroupId) || null,
          sources: {
            productAd: { ok: productResult.ok, httpStatus: productResult.httpStatus, rowCount: productRows.length },
            autoTarget: { ok: targetResult.ok, httpStatus: targetResult.httpStatus, rowCount: targetRows.length },
            adGroup: { ok: groupResult.ok, httpStatus: groupResult.httpStatus, rowCount: groupRows.length },
          },
        };
      }

      const before = await readback();
      const responses = [];
      if (execute) {
        for (const request of requests) {
          responses.push(await callJson(request));
          await sleep(700);
        }
        await sleep(5000);
      }
      const after = await readback();
      return JSON.stringify({ execute, requests, before, responses, after });
    })()
  `;

  const raw = await evalInTab(ws, expression, true);
  ws.close();
  const browserResult = JSON.parse(raw || '{}');
  const report = {
    exportedAt: nowIso(),
    mode: execute ? 'execute' : 'dry-run',
    action: 'controlled_reopen_historical_auto_lane',
    config: CONFIG,
    hypothesis: 'Restore only the historically converting KA1744 auto lane; keep daily budget and bids unchanged.',
    rollback: 'Review 2026-06-14 for serving/impressions and 2026-06-18 for cost/order relevance; pause if active spend reaches $5 with 0 orders or irrelevant search terms.',
    ...browserResult,
  };
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify({
    outputFile: OUT_FILE,
    mode: report.mode,
    responseSummary: (report.responses || []).map(item => ({
      name: item.name,
      ok: item.ok,
      code: item.responseCode,
      msg: item.responseMsg,
    })),
    after: {
      productAd: report.after?.productAd ? {
        state: report.after.productAd.state,
        campaignState: report.after.productAd.campaignState,
        groupState: report.after.productAd.groupState,
        servingStatus: report.after.productAd.servingStatus,
      } : null,
      autoTargets: report.after?.autoTargets?.map(row => ({
        targetId: row.targetId,
        targetText: row.targetText,
        state: row.state,
        bid: row.bid,
        campaignState: row.campaignState,
        groupState: row.groupState,
      })),
      adGroup: report.after?.adGroup ? {
        state: report.after.adGroup.state,
        campaignState: report.after.adGroup.campaignState,
      } : null,
    },
  }, null, 2));
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
