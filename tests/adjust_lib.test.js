const assert = require('assert');
const { analyzeCard } = require('../src/adjust_lib');

function baseCard(entity) {
  return {
    sku: 'TEST-SKU',
    price: 10,
    netProfit: 0.3,
    seaProfitRate: 0.3,
    invDays: 20,
    unitsSold_30d: 10,
    adStats: { '30d': { spend: 1, orders: 2, clicks: 20 } },
    campaigns: [{
      keywords: [entity],
      autoTargets: [],
      sponsoredBrands: [],
    }],
  };
}

{
  const actions = analyzeCard(baseCard({
    id: 'kw-3d-spike',
    bid: 1,
    stats3d: { spend: 80, orders: 1, clicks: 8, impressions: 100 },
    stats7d: { spend: 10, orders: 2, clicks: 20, impressions: 200 },
    stats30d: { spend: 10, orders: 6, clicks: 60, impressions: 600 },
  }), []);

  assert.strictEqual(actions.length, 1);
  assert.strictEqual(actions[0].direction, 'down');
  assert.deepStrictEqual(actions[0].snapshot.windows, ['3d', '7d', '30d']);
}

{
  const actions = analyzeCard(baseCard({
    id: 'kw-no-3d',
    bid: 1,
    stats7d: { spend: 1, orders: 4, clicks: 20, impressions: 200 },
    stats30d: { spend: 1, orders: 8, clicks: 60, impressions: 600 },
  }), []);

  assert.strictEqual(actions.length, 1);
  assert.strictEqual(actions[0].direction, 'up');
  assert.deepStrictEqual(actions[0].snapshot.windows, ['7d', '30d']);
}

{
  const card = baseCard({
    id: 'kw-neutral',
    bid: 1,
    stats30d: { spend: 0, orders: 0, clicks: 0, impressions: 0 },
  });
  card.campaigns[0].keywords = [];
  card.campaigns[0].sponsoredBrands = [{
    id: 'sb-low-tacos',
    entityType: 'sbKeyword',
    bid: 1,
    stats7d: { spend: 1, orders: 4, clicks: 20, impressions: 200 },
    stats30d: { spend: 1, orders: 8, clicks: 60, impressions: 600 },
  }];

  const actions = analyzeCard(card, []);
  assert.strictEqual(actions.length, 1);
  assert.strictEqual(actions[0].entityType, 'sbKeyword');
  assert.strictEqual(actions[0].direction, 'up');
}

console.log('adjust_lib tests passed');
