const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = process.argv[2] || path.join(ROOT, 'data', 'snapshots', `system_7day_unadjusted_products_${new Date().toISOString().slice(0, 10)}.json`);
const SITE_ID = 4;
const USER_NAMES = ['HJ17', 'HJ171', 'HJ172'];
const RANGE_YMD = ['2026-04-22', '2026-05-21'];

function findAdvTab() {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9222/json/list', res => {
      let data = '';
      res.on('data', chunk => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const tabs = JSON.parse(data);
          const tab = tabs.find(item => item.url && item.url.includes('adv.yswg.com.cn'));
          if (!tab?.webSocketDebuggerUrl) reject(new Error('Cannot find logged-in adv.yswg.com.cn Chrome debug tab.'));
          else resolve(tab);
        } catch (err) {
          reject(err);
        }
      });
    }).on('error', reject);
  });
}

function connect(tab) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

function createClient(ws) {
  let id = 0;
  const pending = new Map();
  ws.on('message', raw => {
    const msg = JSON.parse(raw);
    if (!Object.prototype.hasOwnProperty.call(msg, 'id')) return;
    const ticket = pending.get(msg.id);
    if (!ticket) return;
    pending.delete(msg.id);
    if (msg.error) ticket.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
    else ticket.resolve(msg.result || {});
  });
  return {
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const next = ++id;
        pending.set(next, { resolve, reject });
        ws.send(JSON.stringify({ id: next, method, params }));
      });
    },
    async eval(expression) {
      const result = await this.send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.text || 'Runtime evaluation failed');
      }
      return result.result?.value;
    },
  };
}

async function main() {
  const tab = await findAdvTab();
  const ws = await connect(tab);
  const client = createClient(ws);
  try {
    await client.send('Runtime.enable');
    const snapshot = await client.eval(`(async () => {
      const xsrf = decodeURIComponent((document.cookie.match(/XSRF-TOKEN=([^;]+)/) || [])[1] || '');
      const headers = { 'content-type': 'application/json;charset=UTF-8', accept: 'application/json, text/plain, */*' };
      if (xsrf) headers['x-xsrf-token'] = xsrf;
      const post = async (url, body) => {
        const res = await fetch(url, { method: 'POST', credentials: 'include', headers, body: JSON.stringify(body) });
        const text = await res.text();
        let json;
        try { json = JSON.parse(text); } catch (_) { json = { raw: text }; }
        return { status: res.status, ok: res.ok, json };
      };
      const rangeYmd = ${JSON.stringify(RANGE_YMD)};
      const summaryPayload = { siteId: ${SITE_ID}, userName: ${JSON.stringify(USER_NAMES)}, level: 'seller_num', page: 1, limit: 500 };
      const spPayload = {
        siteId: ${SITE_ID},
        timeRange: [new Date(rangeYmd[0] + 'T00:00:00+08:00').getTime(), new Date(rangeYmd[1] + 'T23:59:59+08:00').getTime()],
        state: '4',
        userName: ${JSON.stringify(USER_NAMES)},
        level: 'seller_num',
        lowCost: 2,
        publicAdv: '2',
        updateWeekday: '2',
        page: 1,
        limit: 500,
      };
      const sbPayload = {
        siteId: ${SITE_ID},
        activeStatus: 'ENABLED',
        searchType: '1',
        userName: ${JSON.stringify(USER_NAMES)},
        level: 'seller_num',
        selectCampaignDate: rangeYmd,
        field: 'Spend',
        order: 'desc',
        filterForm: { updateWeekday: '2' },
        source: 'new',
        page: 1,
        limit: 500,
      };
      const [spSummary, sbSummary, spDetail, sbDetail] = await Promise.all([
        post('/advProduct/totalProductUnadjusted', summaryPayload),
        post('/sbProduct/totalProductUnadjusted', summaryPayload),
        post('/advProduct/all', spPayload),
        post('/campaignSb/findAllNew', sbPayload),
      ]);
      const spRows = Array.isArray(spDetail.json?.data) ? spDetail.json.data : (Array.isArray(spDetail.json?.data?.data) ? spDetail.json.data.data : []);
      const sbRows = Array.isArray(sbDetail.json?.data) ? sbDetail.json.data : (Array.isArray(sbDetail.json?.data?.data) ? sbDetail.json.data.data : []);
      const campaignIds = [...new Set(sbRows.map(row => String(row.campaignId || '')).filter(Boolean))];
      const sbSkuInfo = {};
      for (let i = 0; i < campaignIds.length; i += 80) {
        const ids = campaignIds.slice(i, i + 80);
        const info = await post('/sbProduct/getProductInfoByCampaign', { campaignIds: ids, siteId: ${SITE_ID} });
        const data = info.json?.data;
        if (data && !Array.isArray(data) && typeof data === 'object') {
          for (const [id, rows] of Object.entries(data)) {
            sbSkuInfo[String(id)] = Array.isArray(rows) ? rows : [];
          }
        }
        for (const row of Array.isArray(data) ? data : []) {
          const id = String(row.campaign_id || row.campaignId || '');
          if (!id) continue;
          if (!sbSkuInfo[id]) sbSkuInfo[id] = [];
          sbSkuInfo[id].push(row);
        }
      }
      const firstTotal = response => Number(response?.json?.data?.[0]?.unadjusted_campaign_num || 0);
      return {
        exportedAt: new Date().toISOString(),
        sourceTab: location.href,
        rangeYmd,
        summaryPayload,
        spPayload,
        sbPayload,
        summaries: { sp: spSummary.json, sb: sbSummary.json },
        spCount: firstTotal(spSummary),
        sbCount: firstTotal(sbSummary),
        spRows,
        sbRows,
        sbSkuInfo,
      };
    })()`);
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(snapshot, null, 2), 'utf8');
    console.log(JSON.stringify({
      out: OUT,
      exportedAt: snapshot.exportedAt,
      spCount: snapshot.spCount,
      sbCount: snapshot.sbCount,
      spRows: snapshot.spRows.length,
      sbRows: snapshot.sbRows.length,
    }, null, 2));
  } finally {
    ws.close();
  }
}

main().catch(err => {
  console.error(err.stack || err.message || String(err));
  process.exit(1);
});
