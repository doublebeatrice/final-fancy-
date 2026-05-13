const assert = require('assert');
const { buildStateToggleRequest, missingStateRowIsSuccess, stateValueForEntity, stateEntityRowId } = require('../auto_adjust');

const campaignBackedByKeywordRow = {
  keywordId: 'kw-1',
  targetId: 'target-1',
  adId: 'ad-1',
  campaignId: 'campaign-1',
};

assert.strictEqual(
  stateEntityRowId(campaignBackedByKeywordRow, 'campaign'),
  'campaign-1',
  'campaign state execution must match rows by campaignId even when child ids are present'
);

assert.strictEqual(
  stateEntityRowId(campaignBackedByKeywordRow, 'keyword'),
  'kw-1',
  'child state execution should keep matching by child entity id'
);

const request = buildStateToggleRequest({
  siteId: 4,
  accountId: 210,
  campaignId: 'campaign-1',
  keywordId: 'kw-1',
}, 'pause', 'campaign');

assert.strictEqual(request.ok, true);
assert.strictEqual(request.requestUrl, '/campaign/batchCampaign');
assert.strictEqual(request.requestBody.column, 'state');
assert.deepStrictEqual(request.requestBody.campaignIdArray, ['campaign-1']);
assert.deepStrictEqual(request.requestBody.columnVal, [2]);
assert.deepStrictEqual(request.requestBody.batchValue, [2]);
assert.strictEqual(request.requestBody.campaignNewArray[0].state, 2);
assert.strictEqual(request.requestBody.campaignNewArray[0].campaignState, 2);

assert.strictEqual(
  missingStateRowIsSuccess('campaign', 'pause', 'paused'),
  true,
  'paused SP campaign may leave the active campaign-backed row pool and still count as landed'
);

assert.strictEqual(
  missingStateRowIsSuccess('campaign', 'enable', 'enabled'),
  false,
  'enabled campaign must be visible after execution'
);

assert.strictEqual(
  stateValueForEntity({ state: 1, campaignState: 2 }, 'campaign'),
  2,
  'campaign verification must prefer campaignState over child row state'
);

console.log('campaign_state_metadata tests passed');
