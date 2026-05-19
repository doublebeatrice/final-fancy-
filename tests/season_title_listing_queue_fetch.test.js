const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  buildListingFetchTasksFromQueue,
  buildFetchOptionsFromQueue,
  reportPathsForFetch,
  readListingQueue,
  runWithTimeout,
  resolveQueueFile,
} = require('../scripts/execute/fetch_season_title_listing_queue');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'season-title-queue-'));
const queueFile = path.join(tmp, 'queue.json');
fs.writeFileSync(queueFile, JSON.stringify({
  skus: ['AAA001', 'BBB002', 'AAA001', '', null, 'CCC003'],
  items: [
    { sku: 'DDD004' },
  ],
}, null, 2));

{
  const queue = readListingQueue(queueFile);
  assert.deepStrictEqual(queue.skus, ['AAA001', 'BBB002', 'CCC003']);
}

{
  const options = buildFetchOptionsFromQueue({ skus: ['AAA001', 'BBB002', 'CCC003'] }, { limit: 2 });
  assert.strictEqual(options.mode, 'fast');
  assert.strictEqual(options.listingStrategy, 'schema');
  assert.deepStrictEqual(options.listingSkus, ['AAA001', 'BBB002']);
  assert.strictEqual(options.listingLimit, 2);
  assert.strictEqual(options.chartStrategy, 'none');
  assert.strictEqual(options.salesHistoryStrategy, 'none');
}

{
  const queue = { skus: ['SKU1', 'SKU2', 'SKU3', 'SKU4'] };
  const snapshot = {
    productCards: [
      { sku: 'SKU1', asin: 'B000000001', salesChannel: 'Amazon.com' },
      { sku: 'SKU2', asin: 'B000000001', salesChannel: 'Amazon.com' },
      { sku: 'SKU3', asin: 'B000000003', salesChannel: 'Amazon.co.uk' },
      { sku: 'SKU4', asin: '', salesChannel: 'Amazon.com' },
    ],
  };
  const tasks = buildListingFetchTasksFromQueue(queue, snapshot, { limit: 4 });
  assert.deepStrictEqual(tasks, [
    { sku: 'SKU1', asin: 'B000000001', domain: 'amazon.com', key: 'amazon.com|B000000001' },
  ]);
}

{
  const resolved = resolveQueueFile({ queue: queueFile });
  assert.strictEqual(resolved, path.resolve(queueFile));
}

{
  const dated = reportPathsForFetch(path.join(tmp, 'season_title_listing_queue_2026-05-15.json'));
  assert.strictEqual(path.basename(dated.outJson), 'season_title_dry_run_2026-05-15.json');
  assert.strictEqual(path.basename(dated.outMd), 'season_title_dry_run_2026-05-15.md');
}

(async () => {
  const ok = await runWithTimeout(() => Promise.resolve('done'), 1000, 'quick');
  assert.strictEqual(ok, 'done');

  let timedOut = false;
  try {
    await runWithTimeout(() => new Promise(() => {}), 10, 'slow');
  } catch (error) {
    timedOut = true;
    assert.ok(error.message.includes('slow timed out'));
  }
  assert.strictEqual(timedOut, true);
  console.log('season title listing queue fetch tests passed');
})().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
