const http = require('http');
const WebSocket = require('ws');

async function main() {
  const tabs = await new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9222/json/list', res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve(JSON.parse(body)));
    }).on('error', reject);
  });
  const advTab = tabs.find(t => /adv\.yswg/.test(t.url));
  if (!advTab) { console.error('No adv tab'); process.exit(1); }

  const ws = new WebSocket(advTab.webSocketDebuggerUrl);
  await new Promise(r => ws.on('open', r));

  function evalInTab(expression) {
    return new Promise((resolve, reject) => {
      const id = Math.floor(Math.random() * 1000000);
      const timer = setTimeout(() => reject(new Error('timeout')), 30000);
      function handler(data) {
        const msg = JSON.parse(data);
        if (msg.id !== id) return;
        clearTimeout(timer);
        ws.off('message', handler);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result?.result?.value);
      }
      ws.on('message', handler);
      ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
    });
  }

  async function patchAdv(endpoint, payload) {
    const payloadStr = JSON.stringify(payload);
    const expr = `(async () => {
      const xsrf = document.cookie.match(/(?:^|;\\s*)XSRF-TOKEN=([^;]+)/)?.[1] || '';
      const res = await fetch('${endpoint}', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'x-xsrf-token': decodeURIComponent(xsrf) },
        body: ${JSON.stringify(payloadStr)}
      });
      const text = await res.text();
      return JSON.stringify({ status: res.status, body: text.slice(0, 500) });
    })()`;
    const raw = await evalInTab(expr);
    return JSON.parse(raw);
  }

  const wait = ms => new Promise(r => setTimeout(r, ms));
  const results = [];

  // 1. Auto target bid changes (autob2b: 0.49/0.49/0.42 -> 0.25)
  console.log('[1/5] autob2b targets -> $0.25');
  const r1 = await patchAdv('/advTarget/batchEditAutoTarget', {
    column: 'bid', property: 'autoTarget', operation: 'bid', manualTargetType: '',
    accountId: 256, siteId: 4,
    idArray: ['342940327039587', '293124415412546', '385463529439903'],
    campaignIdArray: ['99263434058530'],
    targetArray: [
      { targetId: '342940327039587', bid: '0.25', siteId: 4, accountId: 256, campaignId: '99263434058530', adGroupId: '377628638065009' },
      { targetId: '293124415412546', bid: '0.25', siteId: 4, accountId: 256, campaignId: '99263434058530', adGroupId: '377628638065009' },
      { targetId: '385463529439903', bid: '0.25', siteId: 4, accountId: 256, campaignId: '99263434058530', adGroupId: '377628638065009' },
    ],
    targetNewArray: [
      { targetId: '342940327039587', bid: '0.25', siteId: 4, accountId: 256, campaignId: '99263434058530', adGroupId: '377628638065009' },
      { targetId: '293124415412546', bid: '0.25', siteId: 4, accountId: 256, campaignId: '99263434058530', adGroupId: '377628638065009' },
      { targetId: '385463529439903', bid: '0.25', siteId: 4, accountId: 256, campaignId: '99263434058530', adGroupId: '377628638065009' },
    ],
  });
  results.push({ step: 'autob2b_bid_down', ...r1 });
  console.log('  =>', r1.status, r1.body.slice(0, 80));
  await wait(800);

  // 2. Keyword bid changes
  console.log('[2/5] keyword bids (photo card binder $0.28, photocard binder $0.23, a4 kpop $0.12)');
  const r2 = await patchAdv('/keyword/batchKeyword', {
    column: 'bid', property: 'keyword', operation: 'bid', manualTargetType: '',
    accountId: 256, siteId: 4,
    idArray: ['241030429627372', '527237128697490', '303982142755428'],
    campaignIdArray: ['240426200016011'],
    targetArray: [
      { keywordId: '241030429627372', bid: '0.28', siteId: 4, accountId: 256, campaignId: '240426200016011', adGroupId: '61100453784612', matchType: 2 },
      { keywordId: '527237128697490', bid: '0.23', siteId: 4, accountId: 256, campaignId: '240426200016011', adGroupId: '61100453784612', matchType: 3 },
      { keywordId: '303982142755428', bid: '0.12', siteId: 4, accountId: 256, campaignId: '240426200016011', adGroupId: '61100453784612', matchType: 3 },
    ],
    targetNewArray: [
      { keywordId: '241030429627372', bid: '0.28', siteId: 4, accountId: 256, campaignId: '240426200016011', adGroupId: '61100453784612', matchType: 2 },
      { keywordId: '527237128697490', bid: '0.23', siteId: 4, accountId: 256, campaignId: '240426200016011', adGroupId: '61100453784612', matchType: 3 },
      { keywordId: '303982142755428', bid: '0.12', siteId: 4, accountId: 256, campaignId: '240426200016011', adGroupId: '61100453784612', matchType: 3 },
    ],
  });
  results.push({ step: 'kw_bid_adjust', ...r2 });
  console.log('  =>', r2.status, r2.body.slice(0, 80));
  await wait(800);

  // 3. Manual target bid changes (ASIN targets up)
  console.log('[3/5] ASIN targets bid up ($0.09->$0.15, $0.15->$0.20)');
  const r3 = await patchAdv('/advTarget/batchUpdateManualTarget', {
    column: 'bid', property: 'manualTarget', operation: 'bid', manualTargetType: '',
    accountId: 256, siteId: 4,
    idArray: ['306141784074314', '5762083213751'],
    campaignIdArray: ['557251131287154'],
    targetArray: [
      { targetId: '306141784074314', bid: '0.15', siteId: 4, accountId: 256, campaignId: '557251131287154', adGroupId: '484095254767288' },
      { targetId: '5762083213751', bid: '0.20', siteId: 4, accountId: 256, campaignId: '557251131287154', adGroupId: '484095254767288' },
    ],
    targetNewArray: [
      { targetId: '306141784074314', bid: '0.15', siteId: 4, accountId: 256, campaignId: '557251131287154', adGroupId: '484095254767288' },
      { targetId: '5762083213751', bid: '0.20', siteId: 4, accountId: 256, campaignId: '557251131287154', adGroupId: '484095254767288' },
    ],
  });
  results.push({ step: 'asin_target_bid_up', ...r3 });
  console.log('  =>', r3.status, r3.body.slice(0, 80));
  await wait(800);

  // 4. Pause 3 non-converting ASIN targets
  console.log('[4/5] Pause 3 waste ASIN targets');
  const r4 = await patchAdv('/advTarget/batchUpdateManualTarget', {
    column: 'state', property: 'manualTarget', operation: 'state', manualTargetType: '',
    accountId: 256, siteId: 4,
    idArray: ['150617720834746', '80093454865100', '118086323945543'],
    campaignIdArray: ['557251131287154'],
    targetArray: [
      { targetId: '150617720834746', state: 2, siteId: 4, accountId: 256, campaignId: '557251131287154', adGroupId: '484095254767288' },
      { targetId: '80093454865100', state: 2, siteId: 4, accountId: 256, campaignId: '557251131287154', adGroupId: '484095254767288' },
      { targetId: '118086323945543', state: 2, siteId: 4, accountId: 256, campaignId: '557251131287154', adGroupId: '484095254767288' },
    ],
    targetNewArray: [
      { targetId: '150617720834746', state: 2, siteId: 4, accountId: 256, campaignId: '557251131287154', adGroupId: '484095254767288' },
      { targetId: '80093454865100', state: 2, siteId: 4, accountId: 256, campaignId: '557251131287154', adGroupId: '484095254767288' },
      { targetId: '118086323945543', state: 2, siteId: 4, accountId: 256, campaignId: '557251131287154', adGroupId: '484095254767288' },
    ],
  });
  results.push({ step: 'pause_waste_targets', ...r4 });
  console.log('  =>', r4.status, r4.body.slice(0, 80));
  await wait(800);

  // 5. Resume paused keywords (enable state=1 + set new bid)
  // 426472196867194 (a5 photocard binder, paused exact=state2, bid 0.45->0.18)
  // 407108433297348 (kpop binder, paused exact=state2, bid 0.50->0.20)
  console.log('[5/5] Resume 2 paused keywords with lower bids');
  const enableKws = [
    { keywordId: '426472196867194', bid: '0.18', matchType: 3 },
    { keywordId: '407108433297348', bid: '0.20', matchType: 1 },
  ];
  // First enable them
  const r5a = await patchAdv('/keyword/batchKeyword', {
    column: 'state', property: 'keyword', operation: 'state', manualTargetType: '',
    accountId: 256, siteId: 4,
    idArray: enableKws.map(k => k.keywordId),
    campaignIdArray: ['240426200016011'],
    targetArray: enableKws.map(k => ({
      keywordId: k.keywordId, state: 1, siteId: 4, accountId: 256,
      campaignId: '240426200016011', adGroupId: '61100453784612', matchType: k.matchType,
    })),
    targetNewArray: enableKws.map(k => ({
      keywordId: k.keywordId, state: 1, siteId: 4, accountId: 256,
      campaignId: '240426200016011', adGroupId: '61100453784612', matchType: k.matchType,
    })),
  });
  results.push({ step: 'enable_paused_kw', ...r5a });
  console.log('  enable =>', r5a.status, r5a.body.slice(0, 80));
  await wait(500);

  // Then set their bids
  const r5b = await patchAdv('/keyword/batchKeyword', {
    column: 'bid', property: 'keyword', operation: 'bid', manualTargetType: '',
    accountId: 256, siteId: 4,
    idArray: enableKws.map(k => k.keywordId),
    campaignIdArray: ['240426200016011'],
    targetArray: enableKws.map(k => ({
      keywordId: k.keywordId, bid: k.bid, siteId: 4, accountId: 256,
      campaignId: '240426200016011', adGroupId: '61100453784612', matchType: k.matchType,
    })),
    targetNewArray: enableKws.map(k => ({
      keywordId: k.keywordId, bid: k.bid, siteId: 4, accountId: 256,
      campaignId: '240426200016011', adGroupId: '61100453784612', matchType: k.matchType,
    })),
  });
  results.push({ step: 'set_resumed_kw_bids', ...r5b });
  console.log('  bid =>', r5b.status, r5b.body.slice(0, 80));

  ws.close();

  const allOk = results.every(r => r.status === 200);
  console.log('\n=== Summary ===');
  console.log('All OK:', allOk);
  results.forEach(r => console.log(` ${r.step}: HTTP ${r.status}`));
  if (!allOk) process.exit(1);
}

main().catch(e => { console.error(e.message); process.exit(1); });
