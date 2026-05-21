const assert = require('assert');
const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const {
  extractLocalInventory,
  localInventoryQuantity,
} = require('../src/local_inventory');
const { buildDailyTaskPool } = require('../src/task_scheduler');

const gm3068Raw = {
  sku: 'GM3068',
  last_shipment_time: '2026-05-18 20:43:24',
  last_shipment_quantity: 10,
  shipping_amount: 80,
  inventory_amount: 0,
  available_inventory: 0,
  unstock_in_amount: 0,
  today_made_plan: 0,
  inbound: 50,
  fulFillable: 55,
  reserved: 4,
};

const gm3068Local = extractLocalInventory(gm3068Raw);
assert.deepStrictEqual(gm3068Local.shipmentRecord, {
  lastShipmentTime: '2026-05-18 20:43:24',
  lastShipmentDate: '2026-05-18',
  lastShipmentQuantity: 10,
});
assert.strictEqual(gm3068Local.purchasedTotal, 80);
assert.strictEqual(gm3068Local.goodStock, 0);
assert.strictEqual(gm3068Local.pendingAndTestStock, 80);
assert.strictEqual(gm3068Local.testWarehouseStock, 0);
assert.strictEqual(gm3068Local.availableForPlan, 0);
assert.strictEqual(gm3068Local.todayMadePlan, 0);
assert.notStrictEqual(
  gm3068Local.purchasedTotal,
  gm3068Raw.inbound,
  'local purchased/shipping total must not reuse Amazon inbound stock'
);

const xix2353Local = extractLocalInventory({
  sku: 'XIX2353',
  fbaPlan: 0,
  fba_plan_sea: 100,
  fba_plan_total: 0,
  fba_plan_total_sea: 10,
  order_amount: 10,
  inventory_amount: 210,
  available_inventory: 200,
});
assert.strictEqual(xix2353Local.fbaPlanAir, 0);
assert.strictEqual(xix2353Local.fbaPlanSea, 100);
assert.strictEqual(xix2353Local.fbaPlan, 100);
assert.strictEqual(xix2353Local.fbaPlanTotalAir, 0);
assert.strictEqual(xix2353Local.fbaPlanTotalSea, 10);
assert.strictEqual(xix2353Local.fbaPlanTotal, 10);
assert.strictEqual(xix2353Local.orderAmount, 10);

assert.strictEqual(localInventoryQuantity({ localInventory: gm3068Local }), 0);
assert.strictEqual(localInventoryQuantity({ localInventory: { availableForPlan: '', goodStock: 13 } }), 13);
assert.strictEqual(localInventoryQuantity({ localInventory: 8 }), 8);

const pool = buildDailyTaskPool({
  snapshot: {
    productCards: [{
      sku: 'GM3068',
      asin: 'B000000000',
      salesChannel: 'Amazon.com',
      saleStatus: 'normal',
      price: 12,
      profitRate: 0.2,
      invDays: 12,
      unitsSold_7d: 20,
      unitsSold_30d: 50,
      localInventory: gm3068Local,
      adStats: { '7d': { spend: 5, orders: 2 }, '30d': { spend: 15, orders: 8 } },
      sbStats: { '7d': { spend: 0, orders: 0 }, '30d': { spend: 0, orders: 0 } },
      productProfile: { productType: 'decor' },
      createContext: { coverage: { hasSpAuto: true, hasSpKeyword: true, hasSpManual: true } },
    }],
  },
  timeContext: {
    runAt: '2026-05-19T08:30:00.000+08:00',
    businessDate: '2026-05-18',
    dataDate: '2026-05-17',
    siteTimezone: 'America/Los_Angeles',
    sourceRunId: 'local_inventory_test',
  },
  adjustments: [],
});
const gmTask = pool.candidateContexts.find(item => item.sku === 'GM3068');
assert(gmTask, 'GM3068 should be included in the task pool');
assert.strictEqual(gmTask.facts.inventory.local, 0);

const panelPath = path.join(__dirname, '..', 'extension', 'panel.js');
const panelSource = fs.readFileSync(panelPath, 'utf8');
function extractFunction(name) {
  const start = panelSource.indexOf(`function ${name}`);
  assert.notStrictEqual(start, -1, `${name} should exist in panel.js`);
  const bodyStart = panelSource.indexOf('{', start);
  let depth = 0;
  for (let i = bodyStart; i < panelSource.length; i += 1) {
    const char = panelSource[i];
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) return panelSource.slice(start, i + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

const context = {};
vm.createContext(context);
vm.runInContext(`
${extractFunction('readPresentNumField')}
${extractFunction('normalizeLocalShipmentDate')}
${extractFunction('readLocalInventoryFields')}
this.readLocalInventoryFields = readLocalInventoryFields;
`, context);
const panelLocal = context.readLocalInventoryFields(gm3068Raw);
assert.strictEqual(panelLocal.purchasedTotal, 80);
assert.strictEqual(panelLocal.pendingAndTestStock, 80);
assert.strictEqual(panelLocal.availableForPlan, 0);

const panelPlan = context.readLocalInventoryFields({
  sku: 'XIX2353',
  fbaPlan: 0,
  fba_plan_sea: 100,
  fba_plan_total: 0,
  fba_plan_total_sea: 10,
  order_amount: 10,
});
assert.strictEqual(panelPlan.fbaPlanAir, 0);
assert.strictEqual(panelPlan.fbaPlanSea, 100);
assert.strictEqual(panelPlan.fbaPlan, 100);
assert.strictEqual(panelPlan.fbaPlanTotalAir, 0);
assert.strictEqual(panelPlan.fbaPlanTotalSea, 10);
assert.strictEqual(panelPlan.fbaPlanTotal, 10);

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sku-summary-'));
try {
  const snapshotFile = path.join(tmpDir, 'snapshot.json');
  const outputFile = path.join(tmpDir, 'report.json');
  fs.writeFileSync(snapshotFile, JSON.stringify({
    exportedAt: '2026-05-19T10:00:00.000Z',
    productCards: [{
      sku: 'OB4139',
      asin: 'B0GJRV1TCQ',
      price: 31.49,
      invDays: 7,
      sellableDays_30d: 7,
      fulFillable: 16,
      reserved: 0,
      stockInb: 0,
      unitsSold_7d: 9,
      unitsSold_30d: 79,
      productLabels: { product_type: 'variation', holiday_info: '2026-02-11,(empty)' },
      productProfile: {},
      campaigns: [{
        name: 'asin expanded_duck pinata_ob4139',
        productAds: [{ id: 'pa1', state: 2, stats30d: { spend: 10, orders: 0, clicks: 20, impressions: 1000 } }],
        keywords: [],
        autoTargets: [],
        sponsoredBrands: [],
      }],
    }],
  }, null, 2), 'utf8');
  childProcess.execFileSync(process.execPath, [
    path.join(__dirname, '..', 'scripts', 'reports', 'generate_sku_ad_form_summary.js'),
    '--snapshot', snapshotFile,
    '--skus', 'OB4139',
    '--as-of', '2026-05-19',
    '--out', outputFile,
  ], { cwd: path.join(__dirname, '..') });
  const generated = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
  const review = generated.rows[0].replenishmentReview;
  assert.strictEqual(generated.rows[0].productContext.seasonalNode, 'mexican_cinco_fiesta');
  assert.strictEqual(generated.rows[0].productContext.seasonalStage, 'post_peak_tail');
  assert.strictEqual(review.action, 'hold_replenishment_seasonal_tail');
  assert(review.reasons.includes('purchase_moq_missing'));
  assert(review.reasons.includes('after_cinco_de_mayo_peak'));
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
