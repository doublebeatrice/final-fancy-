const assert = require('assert');
const {
  buildNewProductLaunchActions,
} = require('../scripts/generators/generate_proactive_audit_action_schema');

{
  const audit = {
    newProductLaunch: {
      items: [{
        sku: 'SHQ3950',
        issue: 'new_product_missing_basic_ad_structure',
        ageDays: 6,
        invDays: 100,
        units7d: 0,
        spend7d: 0,
      }],
    },
  };
  const products = new Map([['SHQ3950', {
    sku: 'SHQ3950',
    asin: 'B0GT3G8TG6',
    createContext: {
      accountId: 803,
      siteId: 4,
      coverage: {
        hasSpAuto: true,
        hasSpKeyword: false,
        hasSpManual: true,
      },
      keywordSeeds: [
        'mom baby shower gift basket',
        'gift basket',
        'jewelry',
        'decor',
        'party supplies',
        'women',
        'baby',
        'baby shower',
      ],
    },
    productProfile: {
      positioning: 'mom baby shower gift basket',
      productType: 'decor',
      productTypes: ['jewelry'],
      targetAudience: ['women', 'baby'],
      occasion: ['baby shower'],
      listingTitle: 'WinnerWhy Baby Shower Game Sign Kit Includes Wooden Car Blocks and Markers',
    },
    listing: {
      title: 'WinnerWhy Baby Shower Game Sign Kit Includes Wooden Car Blocks and Markers',
    },
  }]]);

  const plans = buildNewProductLaunchActions(audit, products, 10);
  const actions = plans.flatMap(plan => plan.actions || []);
  const keywordCreates = actions.filter(action => action.actionType === 'create' && action.createInput?.mode === 'keywordTarget');

  assert.strictEqual(
    keywordCreates.length,
    0,
    'should not create proactive keyword campaigns when seeds are mostly broad category/audience fragments'
  );
  assert.ok(
    actions.some(action => action.actionType === 'review' && /keyword seeds/i.test(action.reason)),
    'should surface a review item explaining that keyword seeds are too broad'
  );
}

{
  const audit = {
    newProductLaunch: {
      items: [{
        sku: 'NURSE1',
        issue: 'new_product_missing_basic_ad_structure',
        ageDays: 4,
        invDays: 80,
        units7d: 0,
        spend7d: 0,
      }],
    },
  };
  const products = new Map([['NURSE1', {
    sku: 'NURSE1',
    asin: 'B0TESTNURSE',
    createContext: {
      accountId: 339,
      siteId: 4,
      coverage: {
        hasSpAuto: true,
        hasSpKeyword: false,
        hasSpManual: true,
      },
      keywordSeeds: [
        'nurse appreciation gifts',
        'nurse week gifts',
        'thank you nurse gifts',
        'gift basket',
        'women',
        'jewelry',
      ],
    },
    productProfile: {
      positioning: 'nurse appreciation gifts',
      productType: 'bracelet',
      targetAudience: ['nurse', 'women'],
      occasion: ['nurse week'],
    },
  }]]);

  const plans = buildNewProductLaunchActions(audit, products, 10);
  const keywordAction = plans
    .flatMap(plan => plan.actions || [])
    .find(action => action.actionType === 'create' && action.createInput?.mode === 'keywordTarget');

  assert.ok(keywordAction, 'should still create keyword coverage when there are enough specific phrases');
  assert.deepStrictEqual(keywordAction.createInput.keywords, [
    'nurse appreciation gifts',
    'nurse week gifts',
    'thank you nurse gifts',
  ]);
}

{
  const audit = {
    newProductLaunch: {
      items: [{
        sku: 'REUSE1',
        issue: 'new_product_missing_basic_ad_structure',
        ageDays: 5,
        invDays: 90,
        units7d: 0,
        spend7d: 0,
      }],
    },
  };
  const products = new Map([['REUSE1', {
    sku: 'REUSE1',
    asin: 'B0TESTREUSE',
    createContext: {
      accountId: 339,
      siteId: 4,
      coverage: {
        hasSpAuto: true,
        hasSpKeyword: false,
        hasSpManual: true,
      },
      keywordSeeds: [
        'teacher appreciation gifts',
        'teacher week gifts',
        'thank you teacher gifts',
      ],
    },
    campaigns: [{
      campaignId: 'c-phrase',
      adGroupId: 'g-phrase',
      campaignState: 'enabled',
      groupState: 'enabled',
      keywords: [{ id: 'kw-phrase', matchType: 'PHRASE', state: 'enabled' }],
    }],
  }]]);

  const plans = buildNewProductLaunchActions(audit, products, 10);
  const keywordCreates = plans
    .flatMap(plan => plan.actions || [])
    .filter(action => action.actionType === 'create' && action.createInput?.mode === 'keywordTarget');

  assert.strictEqual(
    keywordCreates.length,
    0,
    'should reuse an existing phrase ad group instead of creating a duplicate keyword campaign'
  );
}

console.log('proactive_audit_action_schema tests passed');
