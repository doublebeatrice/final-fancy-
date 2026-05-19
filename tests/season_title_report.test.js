const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  buildSeasonTitleReport,
  writeSeasonTitleReport,
} = require('../scripts/generate_season_title_dry_run');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'season-title-report-'));
const eventsFile = path.join(tmp, 'events.json');
const listingCacheFile = path.join(tmp, 'listing_cache.json');
const outJson = path.join(tmp, 'report.json');
const outMd = path.join(tmp, 'report.md');
const outQueue = path.join(tmp, 'listing_queue.json');

fs.writeFileSync(eventsFile, JSON.stringify([{
  key: 'fathers_day',
  name: "Father's Day",
  coreTerm: "father's day gifts",
  titleTerms: ["Father's Day", 'Dad Gifts'],
  nodeStart: '2026-06-21',
  nodeEnd: '2026-06-21',
  secondStart: '2026-05-22',
  secondEnd: '2026-06-01',
}], null, 2));

fs.writeFileSync(listingCacheFile, JSON.stringify({
  entries: {
    'amazon.com|B0DAD': {
      payload: {
        asin: 'B0DAD',
        title: "Dad Pocket Hug Token - Father's Day Gifts",
      },
    },
  },
}, null, 2));

const snapshot = {
  productCards: [{
    sku: 'DAD001',
    asin: 'B0DAD',
    unitsSold_30d: 1,
    productProfile: {
      productType: 'jewelry',
      targetAudience: ['dad'],
      occasion: ['fathers day'],
      visualTheme: ['dad'],
    },
    createContext: {
      coverage: { hasSpAuto: true },
    },
    adStats: { '30d': { spend: 10, clicks: 40 } },
  }],
};

{
  const report = buildSeasonTitleReport({
    snapshot,
    eventsFile,
    listingCacheFile,
    businessDate: '2026-05-25',
    topSalesLimit: 0,
  });
  assert.strictEqual(report.summary.items, 1);
  assert.strictEqual(report.items[0].currentTitle, "Dad Pocket Hug Token - Father's Day Gifts");
  assert.strictEqual(report.items[0].titleDecision, 'no_title_change_required');
  assert.strictEqual(report.items[0].adDecision, 'auto_execute');
}

{
  const result = writeSeasonTitleReport({
    snapshot,
    eventsFile,
    listingCacheFile,
    businessDate: '2026-05-25',
    topSalesLimit: 0,
    outJson,
    outMd,
    outQueue,
  });
  assert.strictEqual(fs.existsSync(outJson), true);
  assert.strictEqual(fs.existsSync(outMd), true);
  assert.strictEqual(fs.existsSync(outQueue), true);
  assert.strictEqual(result.report.summary.items, 1);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(outQueue, 'utf8')).skus, []);
}

{
  const missing = writeSeasonTitleReport({
    snapshot: {
      productCards: [{
        sku: 'MISS001',
        asin: 'B0MISS',
        productProfile: {
          productType: 'gift',
          targetAudience: ['dad'],
          occasion: ['fathers day'],
          visualTheme: ['dad'],
        },
      }],
    },
    eventsFile,
    listingCacheFile,
    businessDate: '2026-05-25',
    topSalesLimit: 0,
    outJson: path.join(tmp, 'missing.json'),
    outMd: path.join(tmp, 'missing.md'),
    outQueue: path.join(tmp, 'missing_queue.json'),
  });
  assert.deepStrictEqual(missing.listingQueue.skus, ['MISS001']);
}

console.log('season_title_report tests passed');
