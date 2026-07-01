const assert = require('assert');
const {
  buildBidPayload,
  findKeywordRow,
  parseArgs,
} = require('../scripts/execute/direct_sp_keyword_bid_update');

{
  const parsed = parseArgs([
    '--campaign-id', 'c1',
    '--ad-group-id', 'g1',
    '--account-id', '507',
    '--site-id', '4',
    '--term', 'retirement gifts for women 2026',
    '--bid', '0.35',
  ]);
  assert.strictEqual(parsed.campaignId, 'c1');
  assert.strictEqual(parsed.adGroupId, 'g1');
  assert.strictEqual(parsed.accountId, '507');
  assert.strictEqual(parsed.siteId, 4);
  assert.strictEqual(parsed.term, 'retirement gifts for women 2026');
  assert.strictEqual(parsed.bid, 0.35);
}

{
  assert.throws(
    () => parseArgs(['--campaign-id', 'c1']),
    /missing required args/
  );
}

{
  const row = findKeywordRow([
    { keywordText: 'Retirement Gifts For Women 2026', keywordId: 'k1' },
  ], 'retirement gifts for women 2026');
  assert.strictEqual(row.keywordId, 'k1');
}

{
  const payload = buildBidPayload({
    keywordId: 'k1',
    campaignId: 'c1',
    adGroupId: 'g1',
    accountId: '507',
    siteId: 4,
    matchType: 3,
    bidThreshold: 3,
  }, 0.35);
  assert.strictEqual(payload.column, 'bid');
  assert.strictEqual(payload.property, 'keyword');
  assert.deepStrictEqual(payload.idArray, ['k1']);
  assert.deepStrictEqual(payload.campaignIdArray, ['c1']);
  assert.strictEqual(payload.targetNewArray[0].bid, '0.35');
  assert.strictEqual(payload.targetNewArray[0].advType, 'SP');
}

console.log('direct_sp_keyword_bid_update tests passed');
