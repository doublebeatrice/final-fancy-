const assert = require('assert');

const {
  hasReusableSpLane,
  targetLaneForCreateInput,
} = require('../src/ad_structure_reuse');

{
  assert.strictEqual(
    targetLaneForCreateInput({ mode: 'keywordTarget', matchType: 'BROAD' }),
    'keyword:broad'
  );
  assert.strictEqual(
    targetLaneForCreateInput({ mode: 'auto' }),
    'auto'
  );
  assert.strictEqual(
    targetLaneForCreateInput({ mode: 'productTarget', targetType: 'ASIN_EXPANDED_FROM' }),
    'product:asin_expanded_from'
  );
}

{
  const card = {
    campaigns: [{
      campaignId: 'c-broad',
      adGroupId: 'g-broad',
      campaignState: 'enabled',
      groupState: 'enabled',
      name: 'Legacy broad coverage',
      groupName: 'Main ad group',
      keywords: [{ id: 'kw-broad', matchType: 'BROAD', state: 'enabled' }],
    }],
  };

  const reuse = hasReusableSpLane(card, { mode: 'keywordTarget', matchType: 'BROAD' });
  assert.strictEqual(reuse.reusable, true);
  assert.strictEqual(reuse.lane, 'keyword:broad');
  assert.strictEqual(reuse.matches[0].campaignId, 'c-broad');
}

{
  const card = {
    campaigns: [{
      campaignId: 'c-exact',
      adGroupId: 'g-exact',
      campaignState: 'enabled',
      groupState: 'enabled',
      name: 'Exact only',
      keywords: [{ id: 'kw-exact', matchType: 'EXACT', state: 'enabled' }],
    }],
  };

  const reuse = hasReusableSpLane(card, { mode: 'keywordTarget', matchType: 'BROAD' });
  assert.strictEqual(reuse.reusable, false);
}

{
  const card = {
    campaigns: [{
      campaignId: 'c-product',
      adGroupId: 'g-product',
      campaignState: 'enabled',
      groupState: 'enabled',
      autoTargets: [{
        id: 'pt-expanded',
        targetType: 'manual',
        expression: [{ type: 'ASIN_EXPANDED_FROM', value: 'B0TESTASIN1' }],
        state: 'enabled',
      }],
    }],
  };

  const reuse = hasReusableSpLane(card, {
    mode: 'productTarget',
    targetType: 'ASIN_EXPANDED_FROM',
  });
  assert.strictEqual(reuse.reusable, true);
  assert.strictEqual(reuse.lane, 'product:asin_expanded_from');
}

console.log('ad_structure_reuse tests passed');
