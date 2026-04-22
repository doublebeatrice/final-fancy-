const assert = require('assert');
const { analyzeCard, findPanelId, createPanelWs } = require('../src/adjust_lib');
const { groupByAccountSite, hasRecentCandidateBlock } = require('../auto_adjust');

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

assert.strictEqual(typeof findPanelId, 'function');
assert.strictEqual(typeof createPanelWs, 'function');
assert.strictEqual(typeof groupByAccountSite, 'function');
assert.strictEqual(typeof hasRecentCandidateBlock, 'function');

{
  const items = [
    { id: 'a' },
    { id: 'b' },
    { id: 'c' },
  ];
  const metaById = {
    a: { accountId: 120, siteId: 4, campaignId: 'c1', adGroupId: 'g1' },
    b: { accountId: 120, siteId: 4, campaignId: 'c1', adGroupId: 'g2' },
    c: { accountId: 120, siteId: 4, campaignId: 'c2', adGroupId: 'g1' },
  };
  const { groups } = groupByAccountSite(items, item => metaById[item.id], 'SP auto target', ['campaignId', 'adGroupId']);
  assert.strictEqual(groups.size, 3);
}

{
  const history = [
    {
      entityId: 'SP7::TH2843::396698961698398::335413796452031',
      candidateKey: 'SP7::TH2843::396698961698398::335413796452031',
      outcome: 'blocked_by_system_recent_adjust',
      date: new Date().toISOString().slice(0, 10),
    },
    {
      entityId: '297095272081861',
      candidateKey: 'SP7::TH2843::396698961698398::335413796452031',
      outcome: 'blocked_by_system_recent_adjust',
      date: new Date().toISOString().slice(0, 10),
    },
  ];
  assert.strictEqual(
    hasRecentCandidateBlock(history, 'SP7::TH2843::396698961698398::335413796452031'),
    true
  );
  assert.strictEqual(
    hasRecentCandidateBlock(
      history.filter(item => item.entityId !== 'SP7::TH2843::396698961698398::335413796452031'),
      'SP7::TH2843::396698961698398::335413796452031'
    ),
    false
  );
}

console.log('adjust_lib tests passed');
