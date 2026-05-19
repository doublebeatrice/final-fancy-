const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  browserExecutorSource,
  defaultDryRunFile,
  latestListingApplicationFile,
  loadListingCopyPlan,
  redactExecutionResult,
  splitExecutableActions,
} = require('../scripts/execute/run_listing_copy_edits');
const { normalizeProtectedListingSkus } = require('../src/listing_copy_protection');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'listing-copy-exec-'));
const schemaFile = path.join(tmp, 'season_title_listing_applications_2026-05-16.json');
fs.writeFileSync(schemaFile, JSON.stringify({
  businessDate: '2026-05-16',
  items: [{
    sku: 'MF6292',
    actions: [{
      entityType: 'listing',
      actionType: 'copy_edit',
      productId: '3005337',
      sku: 'MF6292',
      reason: 'Season title update',
      original: { parentTitle: 'Old title' },
      now: { parentTitle: 'New title' },
      decisionStage: 'ai_approved',
      approvedBy: 'codex',
      actionSource: ['codex'],
      requiresAiDecision: false,
      canAutoExecute: true,
    }],
  }],
}, null, 2));

{
  const plan = loadListingCopyPlan(schemaFile, { limit: 1 });
  assert.strictEqual(plan.businessDate, '2026-05-16');
  assert.strictEqual(plan.actions.length, 1);
  assert.strictEqual(plan.actions[0].sku, 'MF6292');
}

{
  const file = defaultDryRunFile('2026-05-16');
  assert.ok(file.endsWith('listing_copy_edit_dry_run_2026-05-16.json'));
}

{
  const latest = latestListingApplicationFile(tmp);
  assert.strictEqual(latest, schemaFile);
}

{
  const redacted = redactExecutionResult({
    response: { code: 200, id: 123, debug: { cookie: 'secret' } },
    tokenState: { hasCsrf: true },
    body: 'sku=MF6292&x-csrf-token=secret',
  });
  assert.deepStrictEqual(redacted, {
    response: { code: 200, id: 123, debug: '[redacted]' },
    tokenState: { hasCsrf: true },
  });
}

{
  const split = splitExecutableActions([
    planAction('OK1', 'New title'),
    planAction('BAD1', 'A'.repeat(201)),
  ]);
  assert.strictEqual(split.valid.length, 1);
  assert.strictEqual(split.invalid.length, 1);
  assert.strictEqual(split.invalid[0].sku, 'BAD1');
  assert.ok(split.invalid[0].errors.includes('parent_title_too_long'));
}

{
  const split = splitExecutableActions([
    planAction('LEM7532', 'Wedding Season title'),
  ], {
    protectedListingSkus: normalizeProtectedListingSkus(['LEM7532']),
  });
  assert.strictEqual(split.valid.length, 0);
  assert.strictEqual(split.invalid.length, 1);
  assert.ok(split.invalid[0].errors.includes('protected_listing_hold'));
}

{
  const split = splitExecutableActions([
    planAction('LEM7532', 'Wedding Season title'),
  ], {
    snapshot: { productCards: [{ sku: 'LEM7532', saleStatus: '保留页面' }] },
  });
  assert.strictEqual(split.valid.length, 0);
  assert.strictEqual(split.invalid.length, 1);
  assert.strictEqual(split.invalid[0].listingProtection.source, 'saleStatus');
}

function planAction(sku, title) {
  return {
    entityType: 'listing',
    actionType: 'copy_edit',
    productId: '1',
    sku,
    reason: 'reason',
    original: { parentTitle: 'Old title' },
    now: { parentTitle: title },
    decisionStage: 'ai_approved',
    approvedBy: 'codex',
    actionSource: ['codex'],
    requiresAiDecision: false,
    canAutoExecute: true,
  };
}

async function testBrowserExecutorPreservesProductDescriptionFormatting() {
  assert.strictEqual(typeof browserExecutorSource, 'function');
  const previous = {
    document: global.document,
    location: global.location,
    fetch: global.fetch,
  };
  let postedBody = '';
  try {
    global.document = {
      querySelector: selector => (selector === 'meta[name="csrf-token"]' ? { content: 'csrf-token' } : null),
      querySelectorAll: selector => (selector === 'iframe' ? [{ src: 'https://sellerinventory.yswg.com.cn/pm/formal/list?Inventory-Token=test-token' }] : []),
    };
    global.location = { href: 'https://sellerinventory.yswg.com.cn/' };
    const multilineDescription = '</br>Features:\n</br>\n</br>As a gift:\n</br>Line one';
    global.fetch = async (url, options = {}) => {
      if (String(url).includes('/kernel/productEditApply/getOriginData')) {
        return {
          text: async () => JSON.stringify({
            code: 200,
            data: {
              title_en: 'Old title',
              bullet_points: ['Old bullet'],
              product_description: multilineDescription,
              search_core_keywords: 'old keywords',
            },
          }),
        };
      }
      postedBody = String(options.body || '');
      return {
        text: async () => JSON.stringify({ code: 200, msg: '提交成功!', id: 123, ids: [123] }),
      };
    };

    const executor = browserExecutorSource();
    await executor({
      endpoint: 'https://sellerinventory.yswg.com.cn/kernel/productEditApply/store',
      actions: [planAction('MF6292', 'New title')],
    });

    const params = new URLSearchParams(postedBody);
    assert.strictEqual(params.get('original[product_description]'), multilineDescription);
    assert.strictEqual(params.get('now[product_description]'), multilineDescription);
  } finally {
    global.document = previous.document;
    global.location = previous.location;
    global.fetch = previous.fetch;
  }
}

testBrowserExecutorPreservesProductDescriptionFormatting()
  .then(() => {
    console.log('listing copy executor tests passed');
  })
  .catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
