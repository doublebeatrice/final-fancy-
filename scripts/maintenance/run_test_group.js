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
  ads: [/^ad_/, /^high_efficiency/, /^low_efficiency/, /^over_budget/, /^overbudget_/, /^campaign_/, /^direct_sp_/, /^run_actions/],
  deposit: [/^daily_deposit/, /^daily_core/, /^daily_dashboard/, /^daily_closure/, /^wecom_daily/, /^wecom_weekly/],
  'old-products': [/^old_product/, /^run_all_sku_operating_review/, /^sku_operating_review/],
  pricing: [/^price_/, /^inventory_/, /^local_inventory/, /^sales_history/, /^removal_inventory/, /^recover_inventory/],
  selection: [/^selection_/, /^sif_/, /^season_/, /^seasonal_/, /^product_profile/, /^internal_keyword/],
  workflow: [/^proactive_/, /^kpi_/, /^month_kpi/, /^operation_/, /^execution_/, /^decision_/, /^landed_/, /^trend_/],
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

function matchesGroup(file, group) {
  if (!group || group === 'all') return true;
  if (group === 'ops') return classifyTestFile(file) === 'ops';
  const patterns = GROUP_PATTERNS[group];
  if (!patterns) return classifyTestFile(file) === group;
  const name = testName(file);
  return patterns.some(pattern => pattern.test(name));
}

function selectTests(tests, group) {
  const normalized = tests.map(normalize);
  if (!group || group === 'all') return normalized;
  return normalized.filter(file => matchesGroup(file, group));
}

function changedFileToTestName(file) {
  const normalized = normalize(file);
  if (normalized === 'package.json') {
    return 'tests/package_scripts_catalog.test.js';
  }
  if (normalized.startsWith('tests/') && normalized.endsWith('.test.js')) {
    return normalized;
  }
  if (normalized.endsWith('.js')) {
    return `tests/${path.basename(normalized, '.js')}.test.js`;
  }
  return null;
}

function selectChangedTests(tests, changedFiles) {
  const normalizedTests = tests.map(normalize);
  const testSet = new Set(normalizedTests);
  const selected = new Set();

  for (const file of changedFiles.map(normalize)) {
    const candidate = changedFileToTestName(file);
    if (candidate && testSet.has(candidate)) {
      selected.add(candidate);
    }
  }

  return normalizedTests.filter(file => selected.has(file));
}

function selectTestsForChangedMode(tests, group, changedFiles) {
  if (group === 'changed' || group === 'staged') {
    return selectChangedTests(tests, changedFiles);
  }
  return selectTests(tests, group);
}

function summarizeGroups(tests) {
  const normalized = tests.map(normalize);
  const counts = new Map([
    ['all', normalized.length],
    ['agent', 0],
    ['core', 0],
    ['maintenance', 0],
    ['messaging', 0],
    ['ops', 0],
    ['ads', 0],
    ['deposit', 0],
    ['old-products', 0],
    ['pricing', 0],
    ['selection', 0],
    ['workflow', 0],
  ]);
  for (const file of normalized) {
    const group = classifyTestFile(file);
    counts.set(group, (counts.get(group) || 0) + 1);
    for (const subgroup of ['ads', 'deposit', 'old-products', 'pricing', 'selection', 'workflow']) {
      if (matchesGroup(file, subgroup)) {
        counts.set(subgroup, (counts.get(subgroup) || 0) + 1);
      }
    }
  }
  return Array.from(counts.entries()).map(([group, count]) => ({ group, count }));
}

function summarizeTestRuns(results, limit = 5) {
  return results
    .slice()
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, limit);
}

function listTestFiles() {
  return fs.readdirSync(path.join(ROOT, 'tests'))
    .filter(name => name.endsWith('.test.js'))
    .map(name => normalize(path.join('tests', name)))
    .sort();
}

function listChangedFiles() {
  const result = spawnSync('git', ['status', '--short'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || 'Unable to read git status.\n');
    process.exit(result.status || 1);
  }
  return result.stdout
    .split(/\r?\n/)
    .map(line => line.trimEnd())
    .filter(Boolean)
    .map(line => {
      const file = line.slice(3);
      const renameIndex = file.indexOf(' -> ');
      return renameIndex === -1 ? file : file.slice(renameIndex + 4);
    });
}

function listStagedFiles() {
  const result = spawnSync('git', ['diff', '--cached', '--name-only'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || 'Unable to read staged git diff.\n');
    process.exit(result.status || 1);
  }
  return result.stdout
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
}

function runTests(files) {
  const results = [];
  for (const file of files) {
    process.stdout.write(`\n> node ${file}\n`);
    const startedAt = Date.now();
    const result = spawnSync(process.execPath, [file], {
      cwd: ROOT,
      stdio: 'inherit',
    });
    results.push({
      file,
      durationMs: Date.now() - startedAt,
    });
    if (result.status !== 0) {
      printTimingSummary(results);
      return result.status || 1;
    }
  }
  printTimingSummary(results);
  return 0;
}

function printTimingSummary(results) {
  if (results.length < 2) return;
  process.stdout.write('\nSlowest tests:\n');
  for (const result of summarizeTestRuns(results)) {
    process.stdout.write(`  ${result.durationMs}ms\t${result.file}\n`);
  }
}

function main() {
  const group = process.argv[2] || 'all';
  if (group === 'list') {
    const summary = summarizeGroups(listTestFiles());
    for (const item of summary) {
      process.stdout.write(`${item.group}\t${item.count}\n`);
    }
    return;
  }
  const allTests = listTestFiles();
  const tests = group === 'changed'
    ? selectTestsForChangedMode(allTests, group, listChangedFiles())
    : (group === 'staged'
        ? selectTestsForChangedMode(allTests, group, listStagedFiles())
        : selectTests(allTests, group));
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
  matchesGroup,
  selectChangedTests,
  selectTestsForChangedMode,
  summarizeGroups,
  summarizeTestRuns,
  selectTests,
};
