#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');

const GROUP_PATTERNS = {
  agent: [/^agent_/, /^goal_/, /^capability_/],
  messaging: [/^wecom_/, /^weixin_/, /^tencent_doc_/, /^package_scripts_catalog$/],
  maintenance: [/^perf_hygiene$/, /^codex_/, /^workflow_runtime_report$/, /^run_test_group$/],
  ops: [
    /^ad_/, /^adjust/, /^ai_/, /^campaign_/, /^cna_/, /^daily_/, /^decision_/,
    /^dedupe_/, /^developer_/, /^direct_/, /^execution_/, /^generator_/,
    /^high_/, /^internal_/, /^invalid_/, /^inventory_/, /^kpi_/, /^landed_/,
    /^listing_/, /^local_/, /^low_/, /^month_/, /^old_/, /^operation_/,
    /^ops_/, /^over_/, /^price_/, /^proactive_/, /^product_/, /^recover_/,
    /^removal_/, /^run_/, /^sales_/, /^sb/, /^season/, /^selection_/,
    /^sif_/, /^sku_/, /^trend_/,
  ],
};

function normalize(file) {
  return file.replace(/\\/g, '/');
}

function testName(file) {
  return path.basename(file).replace(/\.test\.js$/, '');
}

function classifyTestFile(file) {
  const name = testName(file);
  if (GROUP_PATTERNS.agent.some(pattern => pattern.test(name))) return 'agent';
  if (GROUP_PATTERNS.messaging.some(pattern => pattern.test(name))) return 'messaging';
  if (GROUP_PATTERNS.maintenance.some(pattern => pattern.test(name))) return 'maintenance';
  if (GROUP_PATTERNS.ops.some(pattern => pattern.test(name))) return 'ops';
  return 'core';
}

function selectTests(tests, group) {
  const normalized = tests.map(normalize);
  if (!group || group === 'all') return normalized;
  return normalized.filter(file => classifyTestFile(file) === group);
}

function listTestFiles() {
  return fs.readdirSync(path.join(ROOT, 'tests'))
    .filter(name => name.endsWith('.test.js'))
    .map(name => normalize(path.join('tests', name)))
    .sort();
}

function runTests(files) {
  for (const file of files) {
    process.stdout.write(`\n> node ${file}\n`);
    const result = spawnSync(process.execPath, [file], {
      cwd: ROOT,
      stdio: 'inherit',
    });
    if (result.status !== 0) {
      return result.status || 1;
    }
  }
  return 0;
}

function main() {
  const group = process.argv[2] || 'all';
  const tests = selectTests(listTestFiles(), group);
  if (!tests.length) {
    process.stderr.write(`No tests found for group: ${group}\n`);
    process.exit(1);
  }
  process.stdout.write(`Running ${tests.length} ${group} test(s).\n`);
  process.exit(runTests(tests));
}

if (require.main === module) {
  main();
}

module.exports = {
  classifyTestFile,
  selectTests,
};
