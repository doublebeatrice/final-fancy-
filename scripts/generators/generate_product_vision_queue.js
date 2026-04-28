const fs = require('fs');
const path = require('path');
const { buildVisionQueue } = require('../../src/product_profile');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

function main() {
  const snapshotFile = process.argv[2];
  const outputFile = process.argv[3] || path.join('data', 'snapshots', 'product_vision_queue.json');
  const limit = Number(process.argv[4] || process.env.PRODUCT_VISION_LIMIT || 30);

  if (!snapshotFile) {
    throw new Error('Usage: node scripts/generators/generate_product_vision_queue.js <profiled_snapshot.json> [output.json] [limit]');
  }

  const snapshot = readJson(snapshotFile);
  const queue = buildVisionQueue(snapshot, { limit });
  const payload = {
    generatedAt: new Date().toISOString(),
    snapshotFile,
    limit,
    count: queue.length,
    instruction: 'Analyze only these image URLs, then write results using the product_vision_results schema.',
    resultSchema: {
      sku: 'string',
      asin: 'string',
      signature: 'copy from queue item',
      productType: 'string',
      productTypes: ['string'],
      targetAudience: ['string'],
      occasion: ['string'],
      seasonality: ['Q1|Q2|Q3|Q4|evergreen'],
      visualTheme: ['string'],
      visibleText: ['string'],
      positioning: 'short product positioning',
      imageListingMatch: 'strong|medium|weak|conflict',
      confidence: 0.0,
      notes: ['string'],
    },
    queue,
  };

  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(payload, null, 2), 'utf8');
  console.log(JSON.stringify({
    outputFile,
    count: queue.length,
    topSkus: queue.slice(0, 10).map(item => ({ sku: item.sku, asin: item.asin, score: item.score })),
  }, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = { main };
