const fs = require('fs');
const path = require('path');
const {
  DEFAULT_CACHE_FILE,
  loadProfileCache,
  mergeVisionResults,
  saveProfileCache,
} = require('../../src/product_profile');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

function readResults(file) {
  const data = readJson(file);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.results)) return data.results;
  if (Array.isArray(data.productVisionResults)) return data.productVisionResults;
  if (data && typeof data === 'object' && (data.sku || data.asin)) return [data];
  throw new Error('vision results must be an array or contain results/productVisionResults array');
}

function main() {
  const snapshotFile = process.argv[2];
  const resultsFile = process.argv[3];
  const outputFile = process.argv[4] || snapshotFile;
  const cacheFile = process.env.PRODUCT_PROFILE_CACHE || DEFAULT_CACHE_FILE;

  if (!snapshotFile || !resultsFile) {
    throw new Error('Usage: node scripts/generators/merge_product_vision_results.js <profiled_snapshot.json> <vision_results.json> [output.json]');
  }

  const snapshot = readJson(snapshotFile);
  const results = readResults(resultsFile);
  const cache = loadProfileCache(cacheFile);
  const merged = mergeVisionResults(snapshot, results, { cache, cacheFile });

  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(merged.snapshot, null, 2), 'utf8');
  saveProfileCache(merged.cache, cacheFile);

  console.log(JSON.stringify({
    outputFile,
    cacheFile,
    results: results.length,
    merged: merged.meta.visionMerged,
  }, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = { main, readResults };
