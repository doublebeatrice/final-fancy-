const fs = require('fs');
const path = require('path');
const {
  DEFAULT_CACHE_FILE,
  enrichSnapshotWithProfiles,
  loadProfileCache,
  saveProfileCache,
} = require('../../src/product_profile');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

function main() {
  const snapshotFile = process.argv[2];
  const outputFile = process.argv[3] || snapshotFile;
  const cacheFile = process.env.PRODUCT_PROFILE_CACHE || DEFAULT_CACHE_FILE;

  if (!snapshotFile) {
    throw new Error('Usage: node scripts/generators/generate_product_profiles.js <snapshot.json> [output.json]');
  }

  const snapshot = readJson(snapshotFile);
  const cache = loadProfileCache(cacheFile);
  const result = enrichSnapshotWithProfiles(snapshot, { cache, cacheFile });

  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(result.snapshot, null, 2), 'utf8');
  saveProfileCache(result.cache, cacheFile);

  console.log(JSON.stringify({
    outputFile,
    cacheFile,
    ...result.meta,
  }, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  main,
};
