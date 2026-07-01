// Independent readback of a freshly-created SP campaign using the canonical
// readbackCreated() from sp_create_flow (same query the create pipeline runs).
// Usage: node scripts/diagnostics/readback_sp_created.js <campaignId> <adGroupId> <mode> [accountId] [siteId] [expectBid]
const { openAdvWs } = require('../../src/adv_backend');
const { readbackCreated } = require('../../src/sp_create_flow');

(async () => {
  const [campaignId, adGroupId, mode = 'auto', accountId = '803', siteId = '4', expectBid = '0.53'] = process.argv.slice(2);
  if (!campaignId || !adGroupId) throw new Error('Usage: <campaignId> <adGroupId> <mode> [accountId] [siteId] [expectBid]');
  const createInput = {
    mode, siteId: Number(siteId), accountId: Number(accountId),
    defaultBid: Number(expectBid),
    keywords: [], targetAsins: [],
  };
  const ws = await openAdvWs();
  try {
    const rb = await readbackCreated(ws, createInput, { campaignId, adGroupId }, { delays: [0] });
    console.log(JSON.stringify(rb, null, 2));
  } finally { try { ws.close(); } catch (_) {} }
})().catch(e => { console.error(e.message); process.exit(1); });
