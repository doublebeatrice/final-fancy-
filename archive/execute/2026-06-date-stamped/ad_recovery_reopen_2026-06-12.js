const fs = require('fs');
const path = require('path');
const { cdpSession, listTabs } = require('../../discovery/lib/cdp');

const ROOT = path.join(__dirname, '..', '..');
const execute = process.argv.includes('--execute');
const OUT_FILE = path.join(
  ROOT,
  'data',
  'actions',
  `ad_recovery_reopen_2026-06-12_${execute ? 'execute' : 'readback'}.json`
);
const DATE_RANGE = ['2026-05-13', '2026-06-11'];

const TARGETS = [
  {
    sku: 'QA2082',
    adId: '525053917377415',
    campaignId: '107615531196369',
    adGroupId: '455471886116891',
    campaignName: 'kw exact_wooden keychain blanks_qa2082',
    reason: 'Historical exact keyword lane had 4 previous orders; inventory gap was the pause reason and current lane has no recent spend.',
  },
  {
    sku: 'QA2082',
    adId: '463158665753318',
    campaignId: '496084172119420',
    adGroupId: '417038152931926',
    campaignName: 'auto_wooden keychain blanks_qa2082',
    reason: 'Historical auto lane had 2 previous orders with efficient ACOS; restore the reusable lane without changing budget or bid.',
  },
  {
    sku: 'QA2085',
    adId: '359855761747896',
    campaignId: '388696795216900',
    adGroupId: '325914533010986',
    campaignName: 'auto_wooden keychain blanks_qa2085',
    reason: 'Inventory-protection pause left the reusable auto lane closed; restore the existing lane only.',
  },
  {
    sku: 'SHQ0554',
    adId: '561120023883588',
    campaignId: '142244869468018',
    adGroupId: '347916040568571',
    campaignName: 'auto_q2 profit shq0554 auto_shq0554',
    reason: 'Current 30-day lane still has 12 orders and 10 previous orders; restore proven delivery lane without changing budget or bid.',
  },
  {
    sku: 'SHQ0554',
    adId: '460076007506324',
    campaignId: '50051596516395',
    adGroupId: '316082571172257',
    campaignName: 'kw broad_camping party favors_shq0554',
    reason: 'Keyword lane still has current and previous orders; restore the proven receiver without changing budget or bid.',
  },
  {
    sku: 'IF0653',
    adId: '518960563878107',
    campaignId: '104691346248410',
    adGroupId: '434722798858745',
    campaignName: 'auto_amazon business_if0653',
    reason: 'Sellerinventory shows current inventory and recent closed-month profit; this is the lowest historical ACOS recovery lane.',
  },
];

function nowIso() {
  return new Date().toISOString();
}

async function findAdvTab() {
  const tabs = await listTabs();
  const tab = tabs.find(item => String(item.url || '').includes('adv.yswg.com.cn'));
  if (!tab?.webSocketDebuggerUrl) throw new Error('Cannot find adv.yswg.com.cn tab on Chrome debug port.');
  return tab;
}

function browserExpression() {
  return `
    (async () => {
      const execute = ${JSON.stringify(execute)};
      const targets = ${JSON.stringify(TARGETS)};
      const dateRange = ${JSON.stringify(DATE_RANGE)};
      const xsrf = document.cookie.match(/(?:^|;\\s*)XSRF-TOKEN=([^;]+)/)?.[1] || '';
      const headers = {
        'Content-Type': 'application/json',
        'x-xsrf-token': decodeURIComponent(xsrf),
      };
      const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
      const getList = json => json?.data?.records || json?.data?.data || json?.data?.list ||
        json?.data?.rows || json?.records || json?.list || json?.rows ||
        (Array.isArray(json?.data) ? json.data : []);
      const enabled = value => value === 1 || String(value).toUpperCase() === 'ENABLED' || String(value) === '1';
      const accountIdFromRow = row => {
        const value = row?.accountId ?? row?.account_id ?? row?.profileId ?? row?.profile_id ?? row?.advertiserId ?? row?.advertiser_id;
        const number = Number(value);
        return Number.isFinite(number) && number > 0 ? number : null;
      };
      const rowSummary = row => row ? {
        sku: row.sku || row.localSku || '',
        asin: row.asin || '',
        accountId: row.accountId ?? row.account_id ?? row.profileId ?? row.profile_id ?? row.advertiserId ?? row.advertiser_id ?? null,
        siteId: row.siteId ?? row.site_id ?? null,
        campaignName: row.campaignName,
        groupName: row.groupName,
        adId: String(row.adId || row.ad_id || row.id || ''),
        campaignId: String(row.campaignId || ''),
        adGroupId: String(row.adGroupId || row.ad_group_id || ''),
        state: row.state,
        campaignState: row.campaignState,
        groupState: row.groupState,
        servingStatus: row.servingStatus,
        lastAdvUpdatedDate: row.lastAdvUpdatedDate,
        impressions30: Number(row.Impressions || row.impressions30 || 0),
        clicks30: Number(row.Clicks || row.clicks30 || 0),
        spend30: Number(row.Spend || row.spend30 || 0),
        orders30: Number(row.Orders || row.orders30 || 0),
        sales30: Number(row.Sales || row.sales30 || 0),
        orders30prev: Number(row.lastOrders || row.orders30prev || row.OrdersPre || 0),
        dailyBudget: row.dailyBudget || row.budget || '',
        positionType: row.positionType || row.propertyName || '',
      } : null;
      async function postJson(path, body) {
        const res = await fetch(path, {
          method: 'POST',
          credentials: 'include',
          headers,
          body: JSON.stringify(body),
        });
        const text = await res.text();
        let json = null;
        try { json = JSON.parse(text); } catch (_) {}
        return {
          path,
          httpStatus: res.status,
          ok: res.ok,
          json: json || { text: text.slice(0, 600) },
        };
      }
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
          response: json || { text: text.slice(0, 600) },
        };
      }
      async function fetchProductRows(target, state) {
        const payload = {
          selectDate: dateRange,
          mode: 1,
          state,
          siteId: 4,
          sku: target.sku,
          userName: ['HJ17', 'HJ171', 'HJ172'],
          level: 'seller_num',
          field: 'Spend',
          order: 'desc',
          page: 1,
          limit: 500,
        };
        const result = await postJson('/product/adProductData', payload);
        const rows = getList(result.json || {});
        return {
          state,
          ok: result.ok,
          httpStatus: result.httpStatus,
          responseCode: result.json?.code ?? null,
          responseMsg: result.json?.msg || '',
          rowCount: rows.length,
          rows,
        };
      }
      async function readTarget(target) {
        const states = [];
        for (const state of [1, 2, 3]) {
          states.push(await fetchProductRows(target, state));
        }
        const rows = states.flatMap(item => item.rows || []);
        const row = rows.find(item =>
          String(item.adId || item.ad_id || item.id || '') === String(target.adId) ||
          (String(item.campaignId || '') === String(target.campaignId) && String(item.adGroupId || item.ad_group_id || '') === String(target.adGroupId))
        ) || null;
        return {
          found: !!row,
          row: rowSummary(row),
          stateCounts: states.map(item => ({
            state: item.state,
            ok: item.ok,
            httpStatus: item.httpStatus,
            responseCode: item.responseCode,
            responseMsg: item.responseMsg,
            rowCount: item.rowCount,
          })),
          sampleKeys: row ? Object.keys(row).slice(0, 80) : [],
        };
      }
      function requestsFor(target, row) {
        const siteId = Number(row?.siteId || row?.site_id || 4);
        const accountId = accountIdFromRow(row);
        if (!accountId) return { missingAccountId: true, requests: [] };
        return {
          missingAccountId: false,
          siteId,
          accountId,
          requests: [
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
                campaignIdArray: [target.campaignId],
                batch_campaigns: [target.campaignId],
                idArray: [target.campaignId],
                campaignNewArray: [{ siteId, accountId, campaignId: target.campaignId, state: 1, campaignState: 1 }],
              },
            },
            {
              name: 'enableAdGroup',
              method: 'PATCH',
              path: '/advGroup/editGroupColumn',
              body: {
                siteId,
                accountId,
                campaignId: target.campaignId,
                adGroupId: [target.adGroupId],
                key: 'state',
                value: 'enabled',
                property: 'group',
                groupIdArray: [target.adGroupId],
                campaignIdArray: [target.campaignId],
                operation: 'state',
                groupNewArray: [{ siteId, accountId, campaignId: target.campaignId, adGroupId: target.adGroupId, state: 1 }],
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
                products: [target.adId],
                property: 'product',
                idArray: [target.adId],
                operation: 'state',
                campaignIdArray: [target.campaignId],
                productNewArray: [{ siteId, accountId, campaignId: target.campaignId, adGroupId: target.adGroupId, adId: target.adId, state: 1 }],
              },
            },
          ],
        };
      }

      const results = [];
      for (const target of targets) {
        const before = await readTarget(target);
        const requestPlan = requestsFor(target, before.row);
        const responses = [];
        if (execute && !requestPlan.missingAccountId) {
          for (const request of requestPlan.requests) {
            responses.push(await callJson(request));
            await sleep(700);
          }
          await sleep(5000);
        }
        const after = execute && !requestPlan.missingAccountId ? await readTarget(target) : before;
        const landed = !!after.row && enabled(after.row.state) && enabled(after.row.campaignState) && enabled(after.row.groupState);
        results.push({
          target,
          before,
          requestPlan: {
            missingAccountId: requestPlan.missingAccountId,
            siteId: requestPlan.siteId ?? null,
            accountId: requestPlan.accountId ?? null,
            requestNames: requestPlan.requests.map(item => item.name),
          },
          responses,
          after,
          landed,
        });
      }

      return JSON.stringify({ execute, dateRange, results });
    })()
  `;
}

async function main() {
  const tab = await findAdvTab();
  const session = cdpSession(tab, { sendTimeoutMs: 240000, readyTimeoutMs: 30000 });
  await session.ready();
  let raw;
  try {
    const result = await session.send('Runtime.evaluate', {
      expression: browserExpression(),
      returnByValue: true,
      awaitPromise: true,
    });
    raw = result.result?.value;
  } finally {
    session.close();
  }
  const browserResult = JSON.parse(raw || '{}');
  const report = {
    exportedAt: nowIso(),
    mode: execute ? 'execute' : 'dry-run',
    action: 'ad_recovery_reopen_existing_lanes',
    rule: 'Restore only approved reusable lanes; no bid or budget changes.',
    skipPolicy: 'Rows outside TARGETS remain paused/not reopened pending receiver-layer, profit, or clearance diagnosis.',
    ...browserResult,
  };
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify({
    outputFile: OUT_FILE,
    mode: report.mode,
    targets: (report.results || []).map(item => ({
      sku: item.target.sku,
      campaignName: item.target.campaignName,
      accountId: item.requestPlan.accountId,
      missingAccountId: item.requestPlan.missingAccountId,
      before: item.before.row ? {
        state: item.before.row.state,
        campaignState: item.before.row.campaignState,
        groupState: item.before.row.groupState,
        servingStatus: item.before.row.servingStatus,
      } : null,
      responses: (item.responses || []).map(response => ({
        name: response.name,
        ok: response.ok,
        code: response.responseCode,
        msg: response.responseMsg,
      })),
      after: item.after.row ? {
        state: item.after.row.state,
        campaignState: item.after.row.campaignState,
        groupState: item.after.row.groupState,
        servingStatus: item.after.row.servingStatus,
      } : null,
      landed: item.landed,
    })),
  }, null, 2));
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
