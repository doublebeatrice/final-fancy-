#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { OUTPUT_DIR, ensureDiscoveryDirs, makeOutputName, readJson, todayYmd, writeJson } = require('../lib/common');
const { rankSources } = require('../lib/source_ranking');

function arg(name, fallback = '') {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

function latestFieldFiles() {
  if (!fs.existsSync(OUTPUT_DIR)) return [];
  return fs.readdirSync(OUTPUT_DIR)
    .filter(name => /^field_inference_.*\.json$/.test(name))
    .map(name => path.join(OUTPUT_DIR, name))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
}

async function main() {
  ensureDiscoveryDirs();
  const inputs = arg('--input')
    ? arg('--input').split(',').map(item => path.resolve(item.trim())).filter(Boolean)
    : latestFieldFiles();
  const sources = inputs.map(file => {
    const report = readJson(file, {});
    return {
      sourceId: report.sourceId || path.basename(file, '.json'),
      routeName: report.route?.routeName || report.route?.routeId || report.sourceId || '',
      fieldSummary: report.fieldSummary || {},
      networkSummary: report.networkSummary || {},
      endpointSummary: report.endpointSummary || {},
      riskLevel: report.route?.riskLevel || 'read_only',
      inputFile: file,
    };
  });
  const ranked = rankSources(sources);
  const outputFile = path.join(OUTPUT_DIR, makeOutputName('source_rank', '', todayYmd()));
  writeJson(outputFile, {
    generatedAt: new Date().toISOString(),
    sourceCount: ranked.length,
    sources: ranked,
  });
  console.log(outputFile);
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}
