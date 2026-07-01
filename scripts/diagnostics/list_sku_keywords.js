// List existing keyword rows for a SKU, filtered to that SKU's own campaigns,
// so a new (B2B) keyword group can mirror proven converting terms.
// Usage: node scripts/diagnostics/list_sku_keywords.js <SKU> [siteId=4] [days=120] [nameMatch]
const { openAdvWs, advRequest, apiList, ymd, resolveSkuAccount } = require('../../src/adv_backend');
const n = v => Number(v ?? 0);
(async () => {
  const sku = String(process.argv[2] || '').toUpperCase();
  const siteId = Number(process.argv[3] || 4);
  const days = Number(process.argv[4] || 120);
  const nameMatch = String(process.argv[5] || sku).toLowerCase();
  if (!sku) throw new Error('Usage: <SKU> [siteId] [days] [nameMatch]');
  const ws = await openAdvWs();
  try {
    const acct = await resolveSkuAccount(ws, sku, siteId);
    const end = ymd(new Date(Date.now() - 86400000));
    const start = ymd(new Date(Date.now() - 86400000 * days));
    const res = await advRequest(ws, 'POST', '/keyword/findAllNew', {
      siteId, state:'4', coreMark:'0', userName:['HJ17','HJ171','HJ172'],
      level:'seller_num', publicAdv:'2', lowCost:2, accountId: acct.accountId,
      property:'1', selectDate:[start,end], field:'Spend', order:'desc', page:1, limit:500,
    });
    const all = apiList(res.json || {});
    const mine = all.filter(r => String(r.campaignName||'').toLowerCase().includes(nameMatch));
    const MT = {1:'EXACT',2:'PHRASE',3:'BROAD'};
    const norm = mine.map(r => ({
      kw: r.keywordText, match: MT[r.matchType]||r.matchType,
      campaign: r.campaignName, bid: r.bid,
      clicks: n(r.Clicks), orders: n(r.Orders), spend: n(r.Spend),
      sales: n(r.Sales), acos: r.ACOS, cpc: r.CPC, cvr: r.ConversionRate,
      state: r.state, campaignState: r.campaignState,
    })).filter(x => x.kw);
    console.log('account', acct.accountId, '| account rows', all.length, '| SHQ3375 rows', norm.length, '| window', start,'->',end);
    const camps=[...new Set(norm.map(x=>x.campaign))];
    console.log('campaigns:', camps.join(' | '));
    const conv = norm.filter(x=>x.orders>0).sort((a,b)=>b.orders-a.orders);
    console.log('\n== CONVERTING TERMS (orders>0) ==');
    for (const x of conv) console.log(`${x.orders}ord ${x.clicks}clk acos=${Number(x.acos).toFixed(3)} cvr=${Number(x.cvr).toFixed(3)} cpc=${Number(x.cpc).toFixed(2)} bid=${x.bid} [${x.match}] "${x.kw}"`);
    console.log('\n== CLICKS>=5 NO ORDER ==');
    for (const x of norm.filter(x=>x.orders===0&&x.clicks>=5).sort((a,b)=>b.clicks-a.clicks).slice(0,15)) console.log(`${x.clicks}clk spend=${x.spend} bid=${x.bid} [${x.match}] "${x.kw}"`);
  } finally { try { ws.close(); } catch(_){} }
})().catch(e=>{console.error('ERR',e.message);process.exit(1);});
