// Revive converting terms — FAST single-pass pipeline. One WS connection does:
//  1. /product/adProductData (AD_STATE=4) -> all campaigns incl paused, with campId+groupId
//  2. for each paused SP keyword group: /keyword/findAllNew scoped (full-time window) -> all keywords
//  3. read current live keyword groups (state==1) for coverage
//  4. aggregate full-time orders, filter: orders>0 + ACOS<=30% + not already live
//  5. emit ranked candidate list with bid = round(cpc + 0.05..0.07)
// Usage: node scripts/revive_converting_terms.js <SKU> [--top N] [--execute] [--breakeven 30]
//   default dry-run: prints candidate plan. --execute appends top-N via /keyword/createKeywordNew + readback.

const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const SKU = String(args.find(a => !a.startsWith('--')) || '').trim().toUpperCase();
const EXECUTE = args.includes('--execute');
function flagNum(name, dflt) { const i = args.indexOf(name); return i >= 0 ? Number(args[i + 1]) : dflt; }
const TOPN = flagNum('--top', 10);
const BREAKEVEN = flagNum('--breakeven', 30);
const DEBUG = args.includes('--debug');
const SITE_ID = 4;
const USERNAME = ['HJ17', 'HJ171', 'HJ172'];
const FULL_START = '2022-01-01';
const END = '2026-06-22';
const SKIP = new Set(['substitutes', 'close-match', 'complements', 'loose-match']);
if (!SKU) throw new Error('Usage: node scripts/revive_converting_terms.js <SKU> [--top N] [--execute] [--breakeven 30]');

function listTabs() { return new Promise((res, rej) => { http.get('http://127.0.0.1:9222/json/list', r => { let b = ''; r.on('data', c => (b += c)); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } }); }).on('error', rej); }); }
function makeWs(u) { return new Promise((res, rej) => { const ws = new WebSocket(u, { perMessageDeflate: false }); ws.once('open', () => res(ws)); ws.once('error', rej); }); }
function evalIn(ws, expr) { return new Promise((res, rej) => { const id = Math.floor(Math.random() * 1e7); const t = setTimeout(() => { ws.off('message', h); rej(new Error('timeout')); }, 90000); const h = d => { let r; try { r = JSON.parse(d); } catch { return; } if (r.id !== id) return; clearTimeout(t); ws.off('message', h); if (r.error) rej(new Error(JSON.stringify(r.error).slice(0, 200))); else res(r.result?.result?.value); }; ws.on('message', h); ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise: true } })); }); }
async function post(ws, pathname, payload) {
  const expr = `(async () => { const xsrf = document.cookie.match(/(?:^|;\\s*)XSRF-TOKEN=([^;]+)/)?.[1] || ''; const res = await fetch(${JSON.stringify(pathname)}, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'x-xsrf-token': decodeURIComponent(xsrf) }, body: ${JSON.stringify(JSON.stringify(payload))} }); const txt = await res.text(); if (txt.trimStart().startsWith('<')) return JSON.stringify({ __html: true }); let j = null; try { j = JSON.parse(txt); } catch {} return JSON.stringify(j || { raw: txt.slice(0, 300) }); })()`;
  try { return JSON.parse(await evalIn(ws, expr) || '{}'); } catch { return {}; }
}
function list(j) { return j?.data?.records || j?.data?.list || j?.data?.data || j?.list || j?.records || (Array.isArray(j?.data) ? j.data : []) || []; }
const tr = (a, b) => [new Date(a + 'T00:00:00').getTime(), new Date(b + 'T00:00:00').getTime() + 86400000];
const num = v => Number(v || 0) || 0;
const norm = s => String(s || '').trim().toLowerCase();
// Only harvest from campaigns/groups that actually belong to this SKU — shared catch-all
// campaigns ("kv low bid-system", "teddy bear kv0324" holding many SKUs) report same-SKU
// metrics relative to THEIR product, not ours, contaminating the candidate list.
const skuOwned = g => norm(g.name + ' ' + g.group).includes(norm(SKU));

async function adGroupKeywords(ws, campaignId, adGroupId, accountId, start, end) {
  const payload = { accountId, siteId: SITE_ID, timeRange: tr(start, end), state: '4', coreMark: '0', userName: USERNAME, level: 'seller_num', publicAdv: '2', lowCost: 2, name: '', queryType: '', field: 'Orders', order: 'desc', page: 1, limit: 500, property: '1', filterArray: { campaignId: [String(campaignId)], adGroupId: [String(adGroupId)] } };
  const r = await post(ws, '/keyword/findAllNew', payload);
  return list(r).filter(row => String(row.adGroupId || '') === String(adGroupId));
}

// Harvest converting CUSTOMER SEARCH TERMS from a serving group (auto/keyword/asin).
// These are real shopper queries that converted but may not be keywords yet.
async function customerSearchTerms(ws, campaignId, adGroupId, accountId, start, end) {
  const q = { campaignId: String(campaignId), adGroupId: String(adGroupId), accountId, siteId: SITE_ID, selectDate: [start, end], field: 'Spend', order: 'desc', page: 1, limit: 500 };
  const expr = `(async () => { const xsrf = document.cookie.match(/(?:^|;\\s*)XSRF-TOKEN=([^;]+)/)?.[1] || ''; const u = new URL('/customerSearch/targetFindAll', location.origin); Object.entries(${JSON.stringify(q)}).forEach(([k,v]) => { if (Array.isArray(v)) { v.forEach(it => u.searchParams.append(k+'[]', it)); } else { u.searchParams.set(k, v); } }); const res = await fetch(u.toString(), { method: 'GET', credentials: 'include', headers: { 'x-xsrf-token': decodeURIComponent(xsrf) } }); const txt = await res.text(); if (txt.trimStart().startsWith('<')) return '[]'; let j=null; try{j=JSON.parse(txt);}catch{} return JSON.stringify((j&&(j.data&&(j.data.records||j.data.list||j.data.data)||(Array.isArray(j&&j.data)?j.data:null)||j.records||j.list))||[]); })()`;
  try { return JSON.parse(await evalIn(ws, expr) || '[]'); } catch { return []; }
}

(async () => {
  const t0 = Date.now();
  const tab = (await listTabs()).find(t => String(t.url || '').includes('adv.yswg.com.cn'));
  if (!tab) throw new Error('no adv tab on :9222');
  const ws = await makeWs(tab.webSocketDebuggerUrl);
  await evalIn(ws, '1');

  // STEP 1: structure incl paused
  const prod = await post(ws, '/product/adProductData', { selectDate: [FULL_START, END], mode: 1, state: 4, siteId: SITE_ID, sku: SKU, userName: USERNAME, level: 'seller_num', field: 'Spend', order: 'desc', page: 1, limit: 500 });
  const structRows = list(prod);
  const accountId = num(structRows[0]?.accountId) || 357;
  // dedup campaign+group, split live vs paused SP keyword-capable groups
  const groups = []; const seen = new Set();
  for (const r of structRows) {
    const cid = String(r.campaignId || ''); const gid = String(r.adGroupId || '');
    if (!cid || !gid) continue;
    const k = cid + '|' + gid; if (seen.has(k)) continue; seen.add(k);
    groups.push({ cid, gid, name: r.campaignName || '', group: r.groupName || '', campState: r.campaignState ?? r.state, groupState: r.groupState });
  }
  // Append destination = a live, SKU-owned MANUAL keyword group. Exclude auto/asin/product-target/
  // catalog/system/low-bid lanes (those aren't manual-keyword groups). Naming varies per SKU
  // (kw_xxx for some, "baby shower games boy yan2278-cs" for others), so match by exclusion not a kw_ prefix.
  const NON_KW_LANE = /auto|asin|product|catalog|low.?bid|lbhp|-pt|advertiser|placement|category|\bsystem\b/i;
  const liveKwGroups = groups.filter(g => String(g.campState) == '1' && String(g.groupState) == '1' && skuOwned(g) && !NON_KW_LANE.test(g.name + ' ' + g.group));
  // any group on a paused campaign (campState 2) OR live campaign w/ paused group — candidates to harvest from
  const harvestGroups = groups.filter(g => (String(g.campState) != '1' || String(g.groupState) != '1') && skuOwned(g));
  console.log(`[${SKU}] acct=${accountId} structRows=${structRows.length} groups=${groups.length} live-kw-groups=${liveKwGroups.length} harvest-groups=${harvestGroups.length}`);
  if (DEBUG) groups.forEach(g => console.log(`   ${String(g.campState) == '1' ? 'C-ON ' : 'C-OFF'} ${String(g.groupState) == '1' ? 'G-ON ' : 'G-OFF'} ${g.name} / ${g.group} [${g.cid}/${g.gid}]`));

  // STEP 2a: full-time keywords from paused harvest groups
  const agg = {};
  for (const g of harvestGroups) {
    const rows = await adGroupKeywords(ws, g.cid, g.gid, accountId, FULL_START, END);
    for (const r of rows) {
      const kw = String(r.keywordText || '').trim(); if (!kw || kw === '0' || kw.length < 3 || SKIP.has(norm(kw))) continue;
      const key = norm(kw);
      if (!agg[key]) agg[key] = { kw, o: 0, c: 0, s: 0, sp: 0, src: 'paused-kw' };
      const a = agg[key]; a.o += num(r.Orders); a.c += num(r.Clicks); a.s += num(r.Sales); a.sp += num(r.Spend);
    }
  }
  // STEP 2b: converting customer-search-terms from ALL SKU-owned groups — INCLUDING paused ones.
  // "Revive" gold lives in PAUSED auto groups (their all-time search-terms), so we must NOT restrict to
  // serving groups. Anti-contamination guard is two-layer, not a 7d same-SKU hard gate (that metric is
  // always 0 for a paused group and would nuke every historical converting term):
  //   1) SKU-owned campaign only (campaign name contains the SKU token) — orders there are predominantly this SKU.
  //   2) Drop only terms with RECENT foreign-basket evidence: otherSku7d>0 AND sameSku7d==0 (proven other-SKU,
  //      e.g. "... nike shoes"). When both 7d fields are 0 (paused / no recent data) we keep the term and lean
  //      on all-time Orders + ACOS<=breakeven + ASIN/number strip downstream.
  const csGroups = groups.filter(g => skuOwned(g)); // live + paused, all SKU-owned
  for (const g of csGroups) {
    const rows = await customerSearchTerms(ws, g.cid, g.gid, accountId, FULL_START, END);
    for (const r of rows) {
      const kw = String(r.customerSearchText || r.searchTerm || '').trim();
      if (!kw || kw.length < 3 || SKIP.has(norm(kw)) || /^b0[a-z0-9]{8}$/i.test(kw) || /^asin=/i.test(kw) || /^\d+$/.test(kw)) continue;
      const ord = num(r.Orders);
      if (ord <= 0) continue;
      const sameU = num(r.UnitsSoldSameSku7d), otherU = num(r.UnitsSoldOtherSku7d);
      if (otherU > 0 && sameU <= 0) continue; // recent foreign-basket evidence -> drop
      const key = norm(kw);
      if (!agg[key]) agg[key] = { kw, o: 0, c: 0, s: 0, sp: 0, src: 'search-term' };
      const a = agg[key]; a.o += ord; a.c += num(r.Clicks); a.sp += num(r.Spend); a.s += num(r.Sales) || num(r.SalesSameSku7d);
    }
  }
  // STEP 3: live coverage (current keywords in live kw groups, state==1)
  const live = new Set();
  for (const g of liveKwGroups) {
    const rows = await adGroupKeywords(ws, g.cid, g.gid, accountId, '2026-05-24', END);
    rows.forEach(r => { if (String(r.state) === '1') live.add(norm(r.keywordText)); });
  }
  // STEP 4: rank + filter
  const aggAll = Object.values(agg);
  const convAll = aggAll.filter(a => a.o > 0);
  if (DEBUG) {
    console.log(`   harvested terms=${aggAll.length} converting=${convAll.length} liveCoverage=${live.size}`);
    convAll.sort((a, b) => b.o - a.o).slice(0, 15).forEach(a => console.log(`   conv: ord=${a.o} acos=${a.s > 0 ? Math.round(a.sp / a.s * 100) : '-'} live=${live.has(norm(a.kw))} src=${a.src} "${a.kw}"`));
  }
  const cands = Object.values(agg).map(a => ({ ...a, acos: a.s > 0 ? Math.round(a.sp / a.s * 100) : null, cpc: a.c > 0 ? +(a.sp / a.c).toFixed(2) : 0 }))
    .filter(a => a.o > 0 && (a.acos == null || a.acos <= BREAKEVEN) && !live.has(norm(a.kw)))
    .sort((x, y) => y.o - x.o || (x.acos || 99) - (y.acos || 99));
  const bidOf = a => Math.max(0.1, +(a.cpc + (a.cpc >= 0.6 ? 0.07 : 0.05)).toFixed(2)) || 0.3;
  const plan = cands.slice(0, TOPN).map(a => ({ keywordText: a.kw, bid: bidOf(a), orders: a.o, acos: a.acos, cpc: a.cpc, matchType: 'BROAD' }));

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n=== [${SKU}] revive candidates (orders>0, ACOS<=${BREAKEVEN}%, not live) — top ${plan.length} ===`);
  plan.forEach((p, i) => console.log(`${i + 1}. ord=${p.orders} acos=${p.acos == null ? '-' : p.acos + '%'} cpc=${p.cpc} -> bid=${p.bid}  [${cands.find(c=>c.kw===p.keywordText)?.src||'?'}]  "${p.keywordText}"`));
  console.log(`\nDISCOVERY took ${elapsed}s (steps 1-5, single connection)`);

  const destGroup = liveKwGroups[0];
  if (!EXECUTE) { console.log(`\n[dry-run] would append to ${destGroup?.name}/${destGroup?.group} [${destGroup?.cid}/${destGroup?.gid}]. add --execute to write.`); ws.close(); return; }
  if (!destGroup) { console.log('NO live kw group to append into; abort.'); ws.close(); return; }

  // STEP 6: append
  const body = { siteId: SITE_ID, accountId, keywords: plan.map(p => ({ campaignId: destGroup.cid, adGroupId: destGroup.gid, bid: p.bid, matchType: 'BROAD', state: 'ENABLED', keywordText: p.keywordText })), keywordGroups: [] };
  const resp = await post(ws, '/keyword/createKeywordNew', body);
  const success = resp?.data?.keyword?.success || [];
  const error = resp?.data?.keyword?.error || [];
  console.log(`\nWRITE code=${resp?.code} success=${success.length} err=${error.length}`);
  success.forEach(s => console.log('  + ' + plan[s.index]?.keywordText + ' -> ' + s.keywordId));
  // STEP 7: readback
  await new Promise(r => setTimeout(r, 8000));
  const rb = await adGroupKeywords(ws, destGroup.cid, destGroup.gid, accountId, '2026-05-24', END);
  const liveNow = new Set(rb.filter(r => String(r.state) === '1').map(r => norm(r.keywordText)));
  const landed = plan.filter(p => liveNow.has(norm(p.keywordText))).length;
  console.log(`READBACK ${landed}/${plan.length} live in ${destGroup.name}`);
  const out = path.join(ROOT, 'data', 'actions', `${SKU.toLowerCase()}_revive_append_2026-06-23.json`);
  fs.writeFileSync(out, JSON.stringify({ exportedAt: new Date().toISOString(), sku: SKU, accountId, destGroup, plan, requestBody: body, response: resp, landed }, null, 2), 'utf8');
  console.log('OUT', out);
  ws.close();
})().catch(e => { console.error(e); process.exit(1); });
