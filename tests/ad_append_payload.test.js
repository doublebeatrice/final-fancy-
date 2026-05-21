const assert = require('assert');
const { buildSpAppendTargetPayload } = require('../auto_adjust');

{
  const built = buildSpAppendTargetPayload({
    positionType: 'keywordTarget',
    adGroupMatchType: 'PHRASE',
    siteId: 4,
    accountId: 803,
    campaignId: 'c1',
    adGroupId: 'g1',
    targets: [
      { value: 'nurse appreciation gifts', matchType: 'PHRASE', bid: 0.31 },
      { value: 'nurse week gifts', matchType: 'PHRASE', bid: 0.35, coreMark: 5 },
    ],
  });

  assert.strictEqual(built.ok, true);
  assert.strictEqual(built.requestUrl, '/keyword/createKeywordNew');
  assert.deepStrictEqual(built.requestBody, {
    siteId: 4,
    accountId: 803,
    keywords: [
      { campaignId: 'c1', adGroupId: 'g1', bid: 0.31, matchType: 'PHRASE', state: 'ENABLED', keywordText: 'nurse appreciation gifts' },
      { campaignId: 'c1', adGroupId: 'g1', bid: 0.35, matchType: 'PHRASE', state: 'ENABLED', keywordText: 'nurse week gifts', coreMark: 5 },
    ],
    keywordGroups: [],
  });
}

{
  const built = buildSpAppendTargetPayload({
    positionType: 'keywordTarget',
    adGroupMatchType: 'PHRASE',
    siteId: 4,
    accountId: 803,
    campaignId: 'c1',
    adGroupId: 'g1',
    targets: [
      { value: 'nurse appreciation gifts', matchType: 'BROAD', bid: 0.31 },
    ],
  });

  assert.strictEqual(built.ok, false);
  assert.ok(built.errors.some(error => error.includes('lane mismatch')));
}

{
  const built = buildSpAppendTargetPayload({
    positionType: 'productTarget',
    siteId: 4,
    accountId: 803,
    campaignId: 'c2',
    adGroupId: 'g2',
    targets: [
      { value: 'b0abc12345', matchType: 'ASIN_EXPANDED_FROM', bid: 0.29, targetMark: 8 },
    ],
  });

  assert.strictEqual(built.ok, true);
  assert.strictEqual(built.requestUrl, '/advTarget/storeManualTarget');
  assert.deepStrictEqual(built.requestBody, {
    siteId: 4,
    accountId: 803,
    targetingClauses: [{
      campaignId: 'c2',
      adGroupId: 'g2',
      expressionType: 'MANUAL',
      state: 'ENABLED',
      bid: 0.29,
      expression: [{ type: 'ASIN_EXPANDED_FROM', value: 'B0ABC12345' }],
      resolvedExpression: [{ type: 'ASIN_EXPANDED_FROM', value: 'B0ABC12345' }],
      targetMark: 8,
    }],
  });
}

console.log('ad append payload tests passed');
