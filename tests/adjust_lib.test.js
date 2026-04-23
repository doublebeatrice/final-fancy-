const assert = require('assert');
const {
  log,
  loadHistory,
  saveHistory,
  hasRecentOutcome,
  findPanelId,
  createPanelWs,
  SNAPSHOTS_DIR,
  today,
} = require('../src/adjust_lib');
const { groupByAccountSite, hasRecentCandidateBlock } = require('../auto_adjust');

assert.strictEqual(typeof log, 'function');
assert.strictEqual(typeof loadHistory, 'function');
assert.strictEqual(typeof saveHistory, 'function');
assert.strictEqual(typeof hasRecentOutcome, 'function');
assert.strictEqual(typeof findPanelId, 'function');
assert.strictEqual(typeof createPanelWs, 'function');
assert.strictEqual(typeof groupByAccountSite, 'function');
assert.strictEqual(typeof hasRecentCandidateBlock, 'function');
assert.strictEqual(typeof SNAPSHOTS_DIR, 'string');
assert.strictEqual(typeof today, 'string');

{
  const history = [
    {
      entityId: 'row-1',
      outcome: 'success',
      date: new Date().toISOString().slice(0, 10),
      actionType: 'bid',
    },
    {
      entityId: 'row-2',
      outcome: 'blocked_by_system_recent_adjust',
      date: new Date().toISOString().slice(0, 10),
      actionType: 'pause',
    },
  ];

  assert.strictEqual(
    hasRecentOutcome(history, item => item.entityId === 'row-1', 'success'),
    true
  );
  assert.strictEqual(
    hasRecentOutcome(history, item => item.entityId === 'row-1', 'blocked_by_system_recent_adjust'),
    false
  );
}

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
