const assert = require('assert');

const {
  aggregateConvertingTerms,
  avgCpcBid,
  shortAdName,
} = require('../src/sb_collection_create_flow');

// Rows mimic /keyword/findAllNew across several groups: real converting terms,
// an auto-bucket pseudo-term, a zero-order term, and a duplicate to merge.
const rows = [
  { keywordText: 'cat deterrent mat', orders: 4, clicks: 20, spend: 10, sales: 100 },
  { keywordText: 'Cat Deterrent Mat', orders: 3, clicks: 16, spend: 8, sales: 80 }, // merges with above (case/space-insensitive)
  { keywordText: 'mat with spikes', orders: 6, clicks: 26, spend: 16.45, sales: 204.91 },
  { keywordText: 'loose-match', orders: 99, clicks: 187, spend: 49.75, sales: 351.76 }, // auto bucket → dropped
  { keywordText: 'no-order term', orders: 0, clicks: 5, spend: 3, sales: 0 }, // no orders → dropped
  { keywordText: 'pricey term', orders: 2, clicks: 10, spend: 50, sales: 60 }, // acos 0.83 → dropped by maxAcos
];

{
  // aggregation: merge dupes, drop auto-bucket + zero-order, rank by orders
  const ranked = aggregateConvertingTerms(rows, {});
  const texts = ranked.map(t => t.kw.toLowerCase());
  assert.ok(!texts.includes('loose-match'), 'auto-bucket term must be dropped');
  assert.ok(!texts.includes('no-order term'), 'zero-order term must be dropped');

  const merged = ranked.find(t => t.kw.toLowerCase() === 'cat deterrent mat');
  assert.strictEqual(merged.orders, 7, 'duplicate keyword orders must sum');
  assert.strictEqual(merged.clicks, 36, 'duplicate keyword clicks must sum');

  // ranked by orders desc: mat with spikes (6) ... cat deterrent mat (7) is highest
  assert.strictEqual(ranked[0].kw.toLowerCase(), 'cat deterrent mat');
  assert.strictEqual(ranked[1].kw.toLowerCase(), 'mat with spikes');
}

{
  // maxAcos filter removes the high-ACOS term
  const ranked = aggregateConvertingTerms(rows, { maxAcos: 0.3 });
  assert.ok(!ranked.some(t => t.kw === 'pricey term'), 'high-ACOS term must be filtered when maxAcos set');
}

{
  // click-weighted avg cpc: total spend / total clicks over the chosen terms
  const top = [
    { cpc: 0.5, clicks: 20, spend: 10 },
    { cpc: 0.633, clicks: 26, spend: 16.45 },
  ];
  const { bid, avgCpcClickWeighted } = avgCpcBid(top);
  // (10 + 16.45) / (20 + 26) = 26.45 / 46 = 0.575
  assert.strictEqual(avgCpcClickWeighted, 0.57);
  assert.ok(bid >= 0.1, 'bid floors at 0.1');
}

{
  // ad name must stay within Amazon's 32-char creative limit
  const name = shortAdName('mats to keep cats off counters', 3);
  assert.ok(name.length <= 32, `ad name must be <= 32 chars, got ${name.length}: "${name}"`);
  assert.ok(name.includes('x3'), 'ad name encodes sku count');
}

console.log('sb_collection_create_flow tests passed');
