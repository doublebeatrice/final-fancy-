const fs = require('fs');
const path = require('path');
const { listingProtectionForSku, loadProtectedListingSkus, normalizeProtectedListingSkus } = require('../../src/listing_copy_protection');

const ROOT = path.join(__dirname, '..', '..');
const ENDPOINT = 'https://sellerinventory.yswg.com.cn/kernel/productEditApply/store';

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function latestSeasonTitleReport(dir = path.join(ROOT, 'data', 'tasks')) {
  if (!fs.existsSync(dir)) return '';
  return fs.readdirSync(dir)
    .filter(name => /^season_title_dry_run_\d{4}-\d{2}-\d{2}\.json$/.test(name))
    .map(name => path.join(dir, name))
    .filter(file => fs.existsSync(file) && fs.statSync(file).size > 3)
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0] || '';
}

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function productIdForSku(snapshot = {}, sku = '') {
  const key = text(sku);
  const inv = snapshot.invMap?.[key] || snapshot.invMap?.[key.toUpperCase()] || {};
  const card = (snapshot.productCards || []).find(item => text(item.sku).toUpperCase() === key.toUpperCase()) || {};
  return text(inv.aid || inv.id || inv.product_id || card.aid || card.id || card.product_id);
}

function productComplianceForSku(snapshot = {}, sku = '') {
  const key = text(sku);
  const inv = snapshot.invMap?.[key] || snapshot.invMap?.[key.toUpperCase()] || {};
  const card = (snapshot.productCards || []).find(item => text(item.sku).toUpperCase() === key.toUpperCase()) || {};
  const productLabel = text(card.productLabels?.product_label || inv.productLabels?.product_label || card.product_label || inv.product_label);
  const isNonChildrenProduct = productLabel.includes('\u975e\u513f\u7ae5\u4ea7\u54c1');
  const isChildrenProduct = !isNonChildrenProduct && productLabel.includes('\u513f\u7ae5');
  return {
    productLabel,
    isChildrenProduct,
    isNonChildrenProduct,
  };
}

function productContextForSku(snapshot = {}, sku = '') {
  const key = text(sku);
  const card = (snapshot.productCards || []).find(item => text(item.sku).toUpperCase() === key.toUpperCase()) || {};
  const profile = card.productProfile || {};
  return {
    listingTitle: text(card.listing?.title || profile.listingTitle),
    productType: text(profile.productType),
    productTypes: Array.isArray(profile.productTypes) ? profile.productTypes.map(text).filter(Boolean) : [],
    targetAudience: Array.isArray(profile.targetAudience) ? profile.targetAudience.map(text).filter(Boolean) : [],
    occasion: Array.isArray(profile.occasion) ? profile.occasion.map(text).filter(Boolean) : [],
    visualTheme: Array.isArray(profile.visualTheme) ? profile.visualTheme.map(text).filter(Boolean) : [],
    positioning: text(profile.positioning),
    categoryPath: text(profile.categoryPath),
  };
}

function buildListingTitleAction(item = {}, snapshot = {}) {
  const sku = text(item.sku);
  const productId = productIdForSku(snapshot, sku);
  const currentTitle = text(item.currentTitle);
  const suggestedTitle = text(item.suggestedTitle);
  if (!sku || !productId || !currentTitle || !suggestedTitle || currentTitle === suggestedTitle) {
    return null;
  }
  const eventName = text(item.selectedEvent?.name || item.selectedEventName || item.selectedStatus || 'seasonal event');
  return {
    entityType: 'listing',
    actionType: 'copy_edit',
    id: `listing::${productId}::${sku}::title`,
    productId,
    sku,
    asin: text(item.asin),
    endpoint: ENDPOINT,
    filedType: 'A',
    toEditorFlag: 1,
    variantStatus: 2,
    beforeStatus: 0,
    languageType: 'us,uk,ca',
    productCompliance: productComplianceForSku(snapshot, sku),
    productContext: productContextForSku(snapshot, sku),
    synchronizeFields: [],
    synchronizeVariantSkus: [],
    remark: `季节标题关键词维护：${eventName}`,
    reason: '季节标题维护：根据产品与季节匹配，补充买家搜索词；如原标题含过期季节词则同步替换或移除。',
    original: {
      parentTitle: currentTitle,
      bulletPoints: [],
      productDescription: '',
      searchCoreKeywords: '',
    },
    now: {
      parentTitle: suggestedTitle,
      bulletPoints: [],
      productDescription: '',
      searchCoreKeywords: '',
    },
    phraseFrequencyText: '',
    hypothesis: `Adding ${eventName} title wording should improve seasonal relevance without changing the product offer.`,
    expectedEffect: {
      sessions: 'watch',
      conversionRate: 'watch',
      orders: 'watch',
      acos: 'watch',
    },
    reviewPlan: {
      windows: [3, 7, 14],
      metrics: ['listingSessions', 'listingConversionRates', 'orders', 'adAcos'],
    },
    riskLevel: 'season_title_listing_copy_edit',
    confidence: 0.75,
    decisionStage: 'ai_approved',
    approvedBy: 'codex',
    actionSource: ['codex'],
    requiresAiDecision: false,
    canAutoExecute: true,
    source: 'season_title_dry_run',
  };
}

function buildSeasonTitleListingApplications({ report = {}, snapshot = {}, protectedListingSkus = [] } = {}) {
  const autoItems = (report.items || []).filter(item => item.titleDecision === 'auto_execute');
  const protectedMap = normalizeProtectedListingSkus(protectedListingSkus);
  const built = [];
  let skippedMissingProductId = 0;
  let skippedProtectedListing = 0;
  for (const item of autoItems) {
    if (listingProtectionForSku(item.sku, protectedMap, snapshot)) {
      skippedProtectedListing += 1;
      continue;
    }
    const action = buildListingTitleAction(item, snapshot);
    if (!action) {
      if (!productIdForSku(snapshot, item.sku)) skippedMissingProductId += 1;
      continue;
    }
    built.push({
      sku: action.sku,
      asin: action.asin,
      summary: action.reason,
      actions: [action],
    });
  }
  return {
    generatedAt: new Date().toISOString(),
    businessDate: report.businessDate || '',
    type: 'season_title_listing_applications',
    endpoint: ENDPOINT,
    dryRunDefault: true,
    note: 'Listing copy edit applications require the sellerinventory browser session. Successful execution means application submitted, not Amazon front-end landed.',
    summary: {
      totalCandidates: (report.items || []).length,
      autoExecutable: autoItems.length,
      built: built.length,
      skippedMissingProductId,
      skippedProtectedListing,
    },
    items: built,
  };
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const get = name => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : '';
  };
  return {
    report: get('--report') || '',
    snapshot: get('--snapshot') || path.join(ROOT, 'data', 'snapshots', 'latest_snapshot.json'),
    protectedListingSkus: get('--protected-listing-skus') || path.join(ROOT, 'data', 'listing_copy_protected_skus.json'),
    out: get('--out') || '',
  };
}

function main() {
  const options = parseArgs(process.argv);
  const reportFile = options.report ? path.resolve(options.report) : latestSeasonTitleReport();
  if (!reportFile) throw new Error('missing season title dry-run report; run npm run ops:season-title:dry first');
  const snapshotFile = path.resolve(options.snapshot);
  const protectedListingSkusFile = path.resolve(options.protectedListingSkus);
  const report = readJson(reportFile);
  const snapshot = readJson(snapshotFile);
  const protectedListingSkus = loadProtectedListingSkus(protectedListingSkusFile);
  const out = path.resolve(options.out || path.join(ROOT, 'data', 'snapshots', `season_title_listing_applications_${report.businessDate || new Date().toISOString().slice(0, 10)}.json`));
  const applications = buildSeasonTitleListingApplications({ report, snapshot, protectedListingSkus });
  applications.protectedListingSkusFile = protectedListingSkusFile;
  writeJson(out, applications);
  console.log(JSON.stringify({
    reportFile,
    snapshotFile,
    out,
    summary: applications.summary,
  }, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  ENDPOINT,
  buildListingTitleAction,
  buildSeasonTitleListingApplications,
  latestSeasonTitleReport,
  productComplianceForSku,
  productContextForSku,
};
