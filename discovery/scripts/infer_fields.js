#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { OUTPUT_DIR, ensureDiscoveryDirs, findRows, makeOutputName, readJson, todayYmd, writeJson } = require('../lib/common');
const { inferFields } = require('../lib/field_inference');
const { classifyEndpointCandidate, summarizeEndpointCandidates } = require('../lib/probe_analysis');

function arg(name, fallback = '') {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

function latestProbeFile() {
  if (!fs.existsSync(OUTPUT_DIR)) return '';
  return fs.readdirSync(OUTPUT_DIR)
    .filter(name => /^report_probe_.*\.json$/.test(name))
    .map(name => path.join(OUTPUT_DIR, name))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0] || '';
}

async function main() {
  ensureDiscoveryDirs();
  const inputFile = path.resolve(arg('--input') || latestProbeFile());
  if (!inputFile || !fs.existsSync(inputFile)) throw new Error('missing probe input: pass --input discovery/output/report_probe_*.json');
  const probe = readJson(inputFile, {});
  const sampleRows = [];
  for (const sample of probe.bodySamples || []) {
    sampleRows.push(...findRows(sample.sample));
  }
  const report = inferFields({
    sourceId: probe.route?.routeId || path.basename(inputFile, '.json'),
    pageColumns: probe.page?.columns || [],
    sampleRows,
  });
  report.inputFile = inputFile;
  report.route = probe.route || {};
  report.networkSummary = {
    requestCount: probe.networkSummary?.requestCount || 0,
    sampleRowCount: sampleRows.length,
    endpointCandidateCount: probe.networkSummary?.endpointCandidateCount || (probe.endpointCandidates || []).length,
  };
  report.endpointSummary = summarizeEndpointCandidates(probe.endpointCandidates || []);
  report.endpointCandidates = (probe.endpointCandidates || []).slice(0, 60).map(candidate => ({
    ...candidate,
    ...classifyEndpointCandidate(candidate),
  }));
  const outputFile = path.join(OUTPUT_DIR, makeOutputName('field_inference', report.sourceId, todayYmd()));
  writeJson(outputFile, report);
  console.log(outputFile);
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}
