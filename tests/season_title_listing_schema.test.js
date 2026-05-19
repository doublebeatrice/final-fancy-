const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  buildSeasonTitleListingApplications,
  latestSeasonTitleReport,
} = require('../scripts/generators/generate_season_title_listing_schema');
const { normalizeProtectedListingSkus } = require('../src/listing_copy_protection');

const report = {
  businessDate: '2026-05-15',
  items: [
    {
      sku: 'LOW001',
      asin: 'B000000001',
      titleDecision: 'auto_execute',
      currentTitle: 'Dad Gift Token',
      suggestedTitle: "Dad Gift Token Father's Day Gifts",
      selectedEvent: { name: "Father's Day", coreTerm: "father's day gifts" },
    },
    {
      sku: 'TOP001',
      asin: 'B000000002',
      highSales: true,
      titleDecision: 'operator_approval_required',
      currentTitle: 'Dad Gift Token',
      suggestedTitle: "Dad Gift Token Father's Day Gifts",
      selectedEvent: { name: "Father's Day", coreTerm: "father's day gifts" },
    },
    {
      sku: 'MISS001',
      asin: 'B000000003',
      titleDecision: 'review_missing_current_title',
      suggestedTitle: "Father's Day Gifts",
      selectedEvent: { name: "Father's Day", coreTerm: "father's day gifts" },
    },
  ],
};

const snapshot = {
  invMap: {
    LOW001: { aid: 12345, sku: 'LOW001', asin: 'B000000001', productLabels: { product_label: '\u975e\u513f\u7ae5\u4ea7\u54c1' } },
    TOP001: { aid: 22345, sku: 'TOP001', asin: 'B000000002' },
  },
};

const applications = buildSeasonTitleListingApplications({ report, snapshot });

assert.strictEqual(applications.businessDate, '2026-05-15');
assert.strictEqual(applications.items.length, 1);
assert.deepStrictEqual(applications.summary, {
  totalCandidates: 3,
  autoExecutable: 1,
  built: 1,
  skippedMissingProductId: 0,
  skippedProtectedListing: 0,
});

const action = applications.items[0].actions[0];
assert.strictEqual(action.entityType, 'listing');
assert.strictEqual(action.actionType, 'copy_edit');
assert.strictEqual(action.productId, '12345');
assert.strictEqual(action.sku, 'LOW001');
assert.strictEqual(action.original.parentTitle, 'Dad Gift Token');
assert.strictEqual(action.now.parentTitle, "Dad Gift Token Father's Day Gifts");
assert.ok(action.remark.startsWith('季节标题关键词维护'));
assert.ok(action.reason.startsWith('季节标题维护'));
assert.strictEqual(action.decisionStage, 'ai_approved');
assert.strictEqual(action.approvedBy, 'codex');
assert.strictEqual(action.requiresAiDecision, false);
assert.deepStrictEqual(action.productCompliance, {
  productLabel: '\u975e\u513f\u7ae5\u4ea7\u54c1',
  isChildrenProduct: false,
  isNonChildrenProduct: true,
});
assert.strictEqual(action.productContext.listingTitle, '');
assert.deepStrictEqual(action.productContext.occasion, []);

{
  const protectedApplications = buildSeasonTitleListingApplications({
    report: {
      businessDate: '2026-05-15',
      items: [{
        sku: 'LOW001',
        asin: 'B000000001',
        titleDecision: 'auto_execute',
        currentTitle: 'Dad Gift Token',
        suggestedTitle: "Dad Gift Token Father's Day Gifts",
        selectedEvent: { name: "Father's Day", coreTerm: "father's day gifts" },
      }],
    },
    snapshot,
    protectedListingSkus: normalizeProtectedListingSkus(['LOW001']),
  });
  assert.strictEqual(protectedApplications.items.length, 0);
  assert.strictEqual(protectedApplications.summary.skippedProtectedListing, 1);
}

{
  const protectedApplications = buildSeasonTitleListingApplications({
    report: {
      businessDate: '2026-05-15',
      items: [{
        sku: 'LOW001',
        asin: 'B000000001',
        titleDecision: 'auto_execute',
        currentTitle: 'Dad Gift Token',
        suggestedTitle: "Dad Gift Token Father's Day Gifts",
        selectedEvent: { name: "Father's Day", coreTerm: "father's day gifts" },
      }],
    },
    snapshot: {
      ...snapshot,
      productCards: [{ sku: 'LOW001', saleStatus: '保留页面' }],
    },
  });
  assert.strictEqual(protectedApplications.items.length, 0);
  assert.strictEqual(protectedApplications.summary.skippedProtectedListing, 1);
}

{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'season-title-listing-schema-'));
  const oldFile = path.join(tmp, 'season_title_dry_run_2026-05-15.json');
  const newFile = path.join(tmp, 'season_title_dry_run_2026-05-16.json');
  fs.writeFileSync(oldFile, '{"ok":true}');
  fs.writeFileSync(newFile, '{"ok":true}');
  const later = Date.now() + 1000;
  fs.utimesSync(oldFile, later / 1000, later / 1000);
  assert.strictEqual(latestSeasonTitleReport(tmp), oldFile);
}

console.log('season title listing schema tests passed');
