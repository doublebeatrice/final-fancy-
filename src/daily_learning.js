const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LEARNING_DIR = path.join(ROOT, 'data', 'learning');

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (_) {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function writeText(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value, 'utf8');
}

function pct(value) {
  return `${(num(value) * 100).toFixed(1)}%`;
}

function sumCardMetrics(cards = []) {
  return cards.reduce((acc, card) => {
    const sp7 = card.adStats?.['7d'] || {};
    const sb7 = card.sbStats?.['7d'] || {};
    const spSales = sp7.sales ?? sp7.Sales;
    const sbSales = sb7.sales ?? sb7.Sales;
    acc.productCards += 1;
    acc.units7d += num(card.unitsSold_7d);
    acc.units30d += num(card.unitsSold_30d);
    acc.adSpend7d += num(sp7.spend) + num(sb7.spend);
    if (spSales !== undefined || sbSales !== undefined) {
      acc.adSales7d += num(spSales) + num(sbSales);
      acc.adSales7dAvailable = true;
    }
    acc.adOrders7d += num(sp7.orders) + num(sb7.orders);
    acc.inventoryTight += num(card.invDays) > 0 && num(card.invDays) < 21 ? 1 : 0;
    acc.staleInventory += num(card.invDays) >= 90 && num(card.unitsSold_30d) <= 3 ? 1 : 0;
    acc.lowProfit += num(card.profitRate) > 0 && num(card.profitRate) < 0.12 ? 1 : 0;
    return acc;
  }, {
    productCards: 0,
    units7d: 0,
    units30d: 0,
    adSpend7d: 0,
    adSales7d: 0,
    adSales7dAvailable: false,
    adOrders7d: 0,
    inventoryTight: 0,
    staleInventory: 0,
    lowProfit: 0,
  });
}

function topSignals(taskPool = {}) {
  const counts = taskPool.summary?.bySignal || taskPool.sourceCandidateSummary?.bySignal || {};
  return Object.entries(counts)
    .map(([signal, count]) => ({ signal, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);
}

function actionBreakdown(records = []) {
  const byAction = {};
  const byDirection = {};
  const landed = { success: 0, failed: 0, planned: 0, unknown: 0 };
  for (const record of records || []) {
    const actionKey = `${record.entityType || 'unknown'}:${record.actionType || 'unknown'}`;
    byAction[actionKey] = (byAction[actionKey] || 0) + 1;
    const direction = record.direction || 'unknown';
    byDirection[direction] = (byDirection[direction] || 0) + 1;
    const outcome = String(record.outcome || '').toLowerCase();
    if (record.dryRun || outcome.includes('dry_run')) landed.planned += 1;
    else if (outcome.includes('success') || outcome.includes('landed')) landed.success += 1;
    else if (outcome.includes('fail') || outcome.includes('miss') || outcome.includes('blocked')) landed.failed += 1;
    else landed.unknown += 1;
  }
  return { byAction, byDirection, landed };
}

function classifyOutcome(record) {
  if (record.dryRun || String(record.outcome || '').toLowerCase().includes('dry_run')) return 'planned';
  const outcome = String(record.outcome || '').toLowerCase();
  if (outcome.includes('success') || outcome.includes('landed')) return 'success';
  if (outcome.includes('fail') || outcome.includes('miss') || outcome.includes('blocked')) return 'failed';
  return 'unknown';
}

function decisionAttribution(records = []) {
  const groups = {};
  for (const record of records || []) {
    const key = (record.approvedBy || '').toLowerCase() || 'unattributed';
    if (!groups[key]) groups[key] = { plannedActions: 0, landedSuccess: 0, landedFailed: 0, dryRunPlanned: 0, unknown: 0 };
    groups[key].plannedActions += 1;
    const bucket = classifyOutcome(record);
    if (bucket === 'success') groups[key].landedSuccess += 1;
    else if (bucket === 'failed') groups[key].landedFailed += 1;
    else if (bucket === 'planned') groups[key].dryRunPlanned += 1;
    else groups[key].unknown += 1;
  }
  return groups;
}

function buildLearningRecord(input = {}) {
  const time = input.timeContext || {};
  const snapshot = input.snapshot || {};
  const taskPool = input.taskPool || {};
  const manifest = input.manifest || {};
  const adjustmentRecords = input.adjustmentRecords || [];
  const snapshotMetrics = sumCardMetrics(snapshot.productCards || []);
  const schema = manifest.schemaValidation || {};
  const executeStep = (manifest.steps || []).find(step => step.name === 'execute_verify_note') || {};

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    time: {
      runAt: time.runAt || manifest.runAt || '',
      businessDate: time.businessDate || manifest.businessDate || '',
      dataDate: time.dataDate || manifest.dataDate || '',
      siteTimezone: time.siteTimezone || manifest.siteTimezone || '',
      sourceRunId: time.sourceRunId || manifest.runId || '',
    },
    sources: {
      snapshotFile: manifest.outputFiles?.snapshotFile || input.snapshotFile || '',
      taskPoolFile: manifest.outputFiles?.dailyTaskPoolJson || '',
      actionSchemaFile: manifest.actionSchemaFile || '',
      dryRunFile: manifest.outputFiles?.dryRunFile || '',
      verifyFile: manifest.outputFiles?.verifyFile || '',
      adjustmentLogFile: manifest.outputFiles?.executeAdjustmentLogFile || manifest.outputFiles?.dryRunAdjustmentLogFile || '',
      manifestFile: manifest.manifestFile || '',
    },
    dataQuality: {
      baselineQuality: snapshotMetrics.productCards > 0 ? 'complete' : 'incomplete',
      productCards: snapshotMetrics.productCards,
      allowedScopeSkuCount: manifest.allowedOperationScope?.allowedScopeSkuCount || schema.allowedScopeSkuCount || 0,
      dataMissing: taskPool.summary?.dataMissing || taskPool.summary?.dataMissing?.total || 0,
      overBudgetStatus: manifest.overBudgetCapture?.status || '',
      warnings: [
        snapshotMetrics.productCards > 0 ? '' : 'snapshot_missing_product_cards',
        executeStep.status === 'skipped' ? 'execution_skipped' : '',
        schema.errorCount > 0 ? 'schema_validation_errors' : '',
      ].filter(Boolean),
    },
    observedPressure: {
      snapshotMetrics: {
        ...snapshotMetrics,
        adAcos7d: snapshotMetrics.adSales7dAvailable && snapshotMetrics.adSales7d > 0
          ? snapshotMetrics.adSpend7d / snapshotMetrics.adSales7d
          : null,
      },
      topSignals: topSignals(taskPool),
      taskSummary: taskPool.summary || {},
    },
    decisions: {
      schemaSkuCount: schema.schemaSkuCount || 0,
      plannedSkus: schema.plannedSkus || 0,
      executableSkus: schema.executableSkus || 0,
      reviewSkus: schema.reviewSkus || 0,
      plannedActions: schema.planActionCount || 0,
      actionBreakdown: actionBreakdown(adjustmentRecords),
      decisionAttribution: decisionAttribution(adjustmentRecords),
    },
    carryForward: {
      mustReadBeforeTomorrowDecision: true,
      measurementWindows: [1, 3, 7, 14, 30],
      compareTomorrowAgainst: {
        snapshotMetrics: true,
        taskPressure: true,
        actionLanding: true,
        skuLevelMovement: true,
      },
      openQuestions: [
        'Did spend reductions reduce waste without cutting orders?',
        'Did budget increases recover profitable orders?',
        'Did paused or lowered entities stay quiet without same-SKU sales loss?',
        'Which seasonal preheat candidates gained impressions, clicks, and orders?',
      ],
    },
  };
}

function renderLearningMarkdown(record = {}) {
  const metrics = record.observedPressure?.snapshotMetrics || {};
  const landed = record.decisions?.actionBreakdown?.landed || {};
  const signals = (record.observedPressure?.topSignals || [])
    .map(item => `- ${item.signal}: ${item.count}`)
    .join('\n') || '- none';
  const attribution = record.decisions?.decisionAttribution || {};
  const attributionLines = Object.keys(attribution).length
    ? Object.entries(attribution)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([who, stats]) => `- ${who}: planned ${stats.plannedActions || 0}, landed ${stats.landedSuccess || 0}, failed ${stats.landedFailed || 0}, dry-run ${stats.dryRunPlanned || 0}`)
        .join('\n')
    : '- none';
  return `# Daily Learning ${record.time?.businessDate || ''}

- dataDate: ${record.time?.dataDate || ''}
- baselineQuality: ${record.dataQuality?.baselineQuality || 'unknown'}
- productCards: ${metrics.productCards || 0}
- 7d units: ${metrics.units7d || 0}
- 7d ad spend: ${num(metrics.adSpend7d).toFixed(2)}
- 7d ad sales: ${metrics.adSales7dAvailable ? num(metrics.adSales7d).toFixed(2) : 'unavailable in snapshot window'}
- 7d ad ACOS: ${metrics.adAcos7d === null || metrics.adAcos7d === undefined ? 'unavailable' : pct(metrics.adAcos7d)}
- inventory tight: ${metrics.inventoryTight || 0}
- stale inventory: ${metrics.staleInventory || 0}
- low profit: ${metrics.lowProfit || 0}

## Task Pressure
${signals}

## Decisions
- schema SKUs: ${record.decisions?.schemaSkuCount || 0}
- planned SKUs: ${record.decisions?.plannedSkus || 0}
- executable SKUs: ${record.decisions?.executableSkus || 0}
- review SKUs: ${record.decisions?.reviewSkus || 0}
- planned actions: ${record.decisions?.plannedActions || 0}
- landed success: ${landed.success || 0}
- landed failed: ${landed.failed || 0}
- dry-run planned: ${landed.planned || 0}

## Decision Attribution
${attributionLines}

## Carry Forward
- Must read this file before tomorrow's decisions.
- Compare 1d, 3d, 7d, 14d, and 30d movement against the sources listed in the JSON record.
`;
}

function persistDailyLearning(input = {}) {
  const record = buildLearningRecord(input);
  const businessDate = record.time.businessDate || new Date().toISOString().slice(0, 10);
  const jsonFile = path.join(LEARNING_DIR, `daily_learning_${businessDate}.json`);
  const mdFile = path.join(LEARNING_DIR, `daily_learning_${businessDate}.md`);
  writeJson(jsonFile, record);
  writeText(mdFile, renderLearningMarkdown(record));
  return { record, jsonFile, mdFile };
}

module.exports = {
  LEARNING_DIR,
  actionBreakdown,
  buildLearningRecord,
  decisionAttribution,
  persistDailyLearning,
  renderLearningMarkdown,
};
