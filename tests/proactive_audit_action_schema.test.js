const assert = require('assert');
const {
  buildExpiredSeasonActions,
  buildNewProductLaunchActions,
  buildReviewItems,
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
    arrivalAdRecovery: {
      items: [{
        sku: 'QA2082',
        asin: 'B0TESTQA82',
        issue: 'ad_recovery_diagnosis_required',
        subIssue: 'arrived_inventory_ads_have_no_effective_delivery',
        requiredAction: 'diagnose_ad_recovery_before_action',
        diagnosticStructureRequired: true,
        ruleSource: 'GBrain:04-standard-playbooks/ad-recovery-full-diagnostic-structure',
      }],
    },
  };
  const products = new Map([['QA2082', { sku: 'QA2082', asin: 'B0TESTQA82' }]]);
  const plans = buildReviewItems(audit, products, 10);
  const action = plans.flatMap(plan => plan.actions || []).find(item => item.actionType === 'review');

  assert.ok(action, 'arrival ad recovery remains a review action until the full diagnostic structure is filled');
  assert.strictEqual(action.id, 'review::QA2082::arrival_ad_recovery');
  assert.ok(action.reason.includes('full ad recovery diagnosis'));
  assert.ok(action.evidence.some(entry => entry === 'requiredAction=diagnose_ad_recovery_before_action'));
}

{
  const audit = {
    expiredSeasonKeywordWaste: {
      items: [{
        sku: 'SAN0383',
        asin: 'B09MK757X9',
        source: 'SB',
        entityId: '509516833949076',
        keywordText: 'western decorations party',
        theme: 'nurse_week_tail',
        themeLabel: 'Nurse Week tail/expired',
        spend3: 0.28,
        orders3: 0,
        spend7: 0.28,
        orders7: 0,
      }],
    },
  };
  const products = new Map([['SAN0383', { sku: 'SAN0383', asin: 'B09MK757X9' }]]);
  const plans = buildExpiredSeasonActions(audit, products, 10, {
    rowsByType: { sbKeyword: [] },
    snapshot: { sbRows: [] },
  });
  const actions = plans.flatMap(plan => plan.actions || []);

  assert.ok(!actions.some(action =>
    action.entityType === 'sbKeyword' &&
    action.actionType === 'pause' &&
    String(action.id) === '509516833949076'
  ), 'missing SB keyword id must not produce an executable pause');
  const review = actions.find(action => action.actionType === 'review' && action.missing_entity_id === '509516833949076');
  assert.ok(review, 'missing entity must be downgraded to a review action');
  assert.strictEqual(review.entityType, 'skuCandidate');
  assert.ok(review.reason.includes('missing_entity_id:sbKeyword:509516833949076'));
}

{
  const audit = {
    expiredSeasonKeywordWaste: {
      items: [{
        sku: 'SAN0383',
        source: 'SB',
        entityId: '509516833949076',
        keywordText: 'western decorations party',
        theme: 'nurse_week_tail',
        themeLabel: 'Nurse Week tail/expired',
        spend3: 0.28,
        orders3: 0,
        spend7: 0.28,
        orders7: 0,
      }],
    },
  };
  const products = new Map([['SAN0383', { sku: 'SAN0383' }]]);
  const plans = buildExpiredSeasonActions(audit, products, 10, {
    snapshot: {
      sbRows: [{
        __adProperty: '4',
        keywordId: '509516833949076',
      }],
    },
  });
  const actions = plans.flatMap(plan => plan.actions || []);
  assert.ok(actions.some(action =>
    action.entityType === 'sbKeyword' &&
    action.actionType === 'pause' &&
    String(action.id) === '509516833949076'
  ), 'existing SB keyword id can still produce the original executable pause');
}

{
  const audit = {
    expiredSeasonKeywordWaste: {
      items: [{
        sku: 'SAN0383',
        source: 'SB',
        entityId: '509516833949076',
        keywordText: 'western decorations party',
        theme: 'nurse_week_tail',
        spend3: 0.28,
        orders3: 0,
        spend7: 0.28,
        orders7: 0,
      }],
    },
  };
  const products = new Map([['SAN0383', { sku: 'SAN0383', campaigns: [] }]]);
  const plans = buildExpiredSeasonActions(audit, products, 10, {
    rowsByType: { sbKeyword: [{ keywordId: '509516833949076' }] },
    snapshot: { sbRows: [{ __adProperty: '4', keywordId: '509516833949076' }] },
  });
  const review = plans.flatMap(plan => plan.actions || []).find(action => action.actionType === 'review');
  assert.ok(review, 'row-only SB keyword must be downgraded when product context cannot execute it');
  assert.strictEqual(review.missing_entity_id, '509516833949076');
  assert.ok(review.reason.includes('product context'));
}

{
  const audit = {
    expiredSeasonKeywordWaste: {
      items: [{
        sku: 'SAN0383',
        source: 'SB',
        entityId: '509516833949076',
        keywordText: 'western decorations party',
        theme: 'nurse_week_tail',
        spend3: 0.28,
        orders3: 0,
        spend7: 0.28,
        orders7: 0,
      }],
    },
  };
  const products = new Map([['SAN0383', {
    sku: 'SAN0383',
    campaigns: [{ sponsoredBrands: [{ id: '509516833949076', entityType: 'sbKeyword' }] }],
  }]]);
  const plans = buildExpiredSeasonActions(audit, products, 10, {
    rowsByType: { sbKeyword: [{ keywordId: '509516833949076' }] },
    snapshot: { sbRows: [{ __adProperty: '4', keywordId: '509516833949076' }] },
  });
  assert.ok(plans.flatMap(plan => plan.actions || []).some(action =>
    action.entityType === 'sbKeyword' &&
    action.actionType === 'pause' &&
    action.id === '509516833949076'
  ), 'SB keyword remains executable when both row data and product context contain the entity');
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
