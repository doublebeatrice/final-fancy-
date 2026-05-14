const assert = require('assert');
const { buildProactiveOperatingAudit } = require('../src/proactive_audit');
const {
  buildExpiredSeasonActions,
  buildNewProductLaunchActions,
  buildReviewItems,
  mergePlans,
} = require('../scripts/generators/generate_proactive_audit_action_schema');

const timeContext = {
  runAt: '2026-05-14T08:00:00.000Z',
  businessDate: '2026-05-14',
  dataDate: '2026-05-13',
  siteTimezone: 'America/Los_Angeles',
  sourceRunId: 'proactive_test',
};

const snapshot = {
  sellerSalesRows: [{
    seller_title: '所选编号汇总',
    order_sales: '538423.55',
    sale_num: '3705',
    net_profit: '0.1787',
    advCost: '0.1166',
    ACOS: '0.2066',
    ROAS: '4.8398',
    CPC: '2.2935',
    refund_percent: '0.0502',
    qty_yoy_over_1_year: '-0.2147',
  }],
  productCards: [
    {
      sku: 'NEW001',
      asin: 'B0NEW001',
      salesChannel: 'Amazon.com',
      saleStatus: '正常销售',
      fuldate: '2026-05-12',
      opendate: '2026-05-12',
      profitRate: 0.28,
      price: 19.99,
      invDays: 120,
      fulFillable: 80,
      reserved: 5,
      unitsSold_3d: 0,
      unitsSold_7d: 0,
      unitsSold_30d: 0,
      adStats: { '3d': { spend: 0, orders: 0, impressions: 0, clicks: 0 }, '7d': { spend: 0, orders: 0, impressions: 0, clicks: 0 } },
      sbStats: { '3d': { spend: 0, orders: 0, impressions: 0, clicks: 0 }, '7d': { spend: 0, orders: 0, impressions: 0, clicks: 0 } },
      createContext: {
        accountId: 1,
        siteId: 4,
        recommendedDailyBudget: 3,
        recommendedDefaultBid: 0.3,
        keywordSeeds: ['graduation party favors', 'graduation gifts bulk', 'party favors for guests'],
        coverage: { hasSpAuto: false, hasSpKeyword: false, hasSpManual: false },
      },
      productProfile: { productType: 'party favor', occasion: ['graduation'], listingTitle: 'Graduation Party Favors' },
    },
    {
      sku: 'NEW002',
      asin: 'B0NEW002',
      salesChannel: 'Amazon.com',
      saleStatus: '正常销售',
      fuldate: '2026-05-10',
      opendate: '2026-05-10',
      profitRate: 0.3,
      price: 22.99,
      invDays: 90,
      fulFillable: 70,
      unitsSold_3d: 0,
      unitsSold_7d: 1,
      unitsSold_30d: 1,
      adStats: { '3d': { spend: 0.2, orders: 0, impressions: 18, clicks: 1 }, '7d': { spend: 0.4, orders: 0, impressions: 42, clicks: 2 } },
      sbStats: { '3d': { spend: 0, orders: 0, impressions: 0, clicks: 0 }, '7d': { spend: 0, orders: 0, impressions: 0, clicks: 0 } },
      createContext: { coverage: { hasSpAuto: true, hasSpKeyword: true, hasSpManual: true } },
      productProfile: { productType: 'gift', occasion: ['fathers day'], listingTitle: 'Father Day Gift' },
    },
    {
      sku: 'TIGHT1',
      asin: 'B0TIGHT1',
      salesChannel: 'Amazon.com',
      saleStatus: '正常销售',
      fuldate: '2026-04-01',
      opendate: '2026-04-01',
      profitRate: 0.26,
      price: 15.99,
      invDays: 9,
      fulFillable: 15,
      unitsSold_3d: 6,
      unitsSold_7d: 18,
      unitsSold_30d: 60,
      adStats: { '3d': { spend: 12, orders: 6, sales: 120, impressions: 3000, clicks: 60 }, '7d': { spend: 32, orders: 15, sales: 320, impressions: 8000, clicks: 130 } },
      sbStats: { '3d': { spend: 0, orders: 0 }, '7d': { spend: 0, orders: 0 } },
      createContext: { coverage: { hasSpAuto: true, hasSpKeyword: true, hasSpManual: true } },
      productProfile: { productType: 'decor', listingTitle: 'Fast Selling Decor' },
    },
    {
      sku: 'LIST1',
      asin: 'B0LIST1',
      salesChannel: 'Amazon.com',
      saleStatus: '正常销售',
      fuldate: '2026-03-01',
      opendate: '2026-03-01',
      profitRate: 0.2,
      price: 18.99,
      invDays: 75,
      fulFillable: 100,
      unitsSold_3d: 0,
      unitsSold_7d: 0,
      unitsSold_30d: 3,
      adStats: { '3d': { spend: 18, orders: 0, sales: 0, impressions: 4000, clicks: 36 }, '7d': { spend: 42, orders: 0, sales: 0, impressions: 9000, clicks: 82 } },
      sbStats: { '3d': { spend: 0, orders: 0 }, '7d': { spend: 0, orders: 0 } },
      createContext: { coverage: { hasSpAuto: true, hasSpKeyword: true, hasSpManual: true } },
      productProfile: { productType: 'gift', listingTitle: '' },
      listing: null,
    },
  ],
  kwRows: [
    {
      keywordId: 'kw-teacher',
      keywordText: 'teacher appreciation gifts',
      campaignName: 'kw broad_teacher appreciation gifts_new001',
      groupName: 'kw broad_teacher appreciation gifts_new001',
      campaignState: 1,
      groupState: 1,
      state: 1,
      bid: '0.45',
      spend3: '12.00',
      orders3: '0',
      sales3: '0',
      clicks3: '30',
      impressions3: '1000',
      spend7: '35.00',
      orders7: '1',
      sales7: '20',
      clicks7: '90',
      impressions7: '3000',
    },
  ],
  sbRows: [
    {
      keywordId: 'sb-nurse',
      keywordText: 'nurses week gifts bulk',
      campaignName: 'sbvkw_nurse appreciation ornaments_new002',
      campaignState: 'ENABLED',
      state: 2,
      bid: '0.3',
      spend3: '4.50',
      orders3: '0',
      sales3: '0',
      clicks3: '10',
      impressions3: '500',
      spend7: '11.00',
      orders7: '0',
      sales7: '0',
      clicks7: '24',
      impressions7: '1200',
    },
  ],
};

const audit = buildProactiveOperatingAudit({ snapshot, timeContext });

assert.strictEqual(audit.requiredModules.every(module => module.status === 'checked'), true);
assert.strictEqual(audit.kpi.current.sales, 538423.55);
assert.strictEqual(audit.kpi.finalTarget.salesGap, 141576.45);
assert(audit.kpi.finalTarget.netProfitRateGap > 0.026);
assert.strictEqual(audit.kpi.status, 'off_track');

assert(audit.newProductLaunch.items.some(item => item.sku === 'NEW001' && item.issue === 'new_product_missing_basic_ad_structure'));
assert(audit.newProductLaunch.items.some(item => item.sku === 'NEW002' && item.issue === 'new_product_existing_structure_low_delivery'));
assert(audit.arrivalAdRecovery.items.some(item => item.sku === 'NEW001' && item.requiredAction === 'build_and_enable_basic_ads'));
assert(audit.priceActions.items.some(item => item.sku === 'TIGHT1' && item.requiredAction === 'review_price_raise_or_recover_price'));
assert(audit.listingRepair.items.some(item => item.sku === 'LIST1' && item.issue === 'traffic_without_conversion_listing_repair'));
assert.strictEqual(audit.expiredSeasonKeywordWaste.summary.totalEnabledRows, 2);
assert.strictEqual(audit.expiredSeasonKeywordWaste.summary.spend3, 16.5);
assert.strictEqual(audit.expiredSeasonKeywordWaste.summary.noOrderSpend3, 16.5);
assert(audit.expiredSeasonKeywordWaste.items.some(item => item.keywordText === 'teacher appreciation gifts' && item.requiredAction === 'pause_or_bid_down_expired_season_keyword'));
assert(audit.expiredSeasonKeywordWaste.items.some(item => item.keywordText === 'nurses week gifts bulk'));

const products = new Map(snapshot.productCards.map(card => [card.sku.toUpperCase(), card]));
const expiredSeasonActions = buildExpiredSeasonActions(audit, products, 10);
const newProductActions = buildNewProductLaunchActions(audit, products, 10);
const reviewItems = buildReviewItems(audit, products, 10);
const mergedPlan = mergePlans([expiredSeasonActions, newProductActions, reviewItems]);
const new001Actions = mergedPlan.find(item => item.sku === 'NEW001')?.actions || [];
const new002Actions = mergedPlan.find(item => item.sku === 'NEW002')?.actions || [];

assert(new001Actions.some(action =>
  action.entityType === 'keyword' &&
  action.id === 'kw-teacher' &&
  action.actionType === 'bid' &&
  action.suggestedBid === 0.36
));
assert(new002Actions.some(action =>
  action.entityType === 'sbKeyword' &&
  action.id === 'sb-nurse' &&
  action.actionType === 'pause'
));
assert(new001Actions.some(action =>
  action.actionType === 'create' &&
  action.createInput?.mode === 'auto' &&
  action.createInput?.sku === 'NEW001'
));
assert(new001Actions.some(action =>
  action.actionType === 'create' &&
  action.createInput?.mode === 'keywordTarget' &&
  action.createInput?.keywords?.includes('graduation party favors')
));
assert(new001Actions.some(action => action.entityType === 'skuCandidate' && action.actionType === 'review'));
assert(reviewItems.some(item => item.sku === 'LIST1'));

console.log('proactive_audit.test.js passed');
