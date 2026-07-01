const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseArgs } = require('../scripts/run_old_product_market_evidence_queue');
const { collectRunnableCommands, parseNpmRunCommand } = require('../scripts/run_agent_command_runner');
const { normalizeSelectionMarketReport } = require('../src/agent_review_evidence');
const {
  buildSelectionReportsFromEvidenceFiles,
  buildMarketEvidenceRunPlan,
  runOldProductMarketEvidenceQueue,
} = require('../src/old_product_market_evidence_queue');

const queue = {
  summary: { total: 1 },
  items: [{
    requestId: 'old_product_maintenance::2026-06-16::OLD1::market_evidence',
    candidateId: 'old_product_maintenance::2026-06-16::OLD1',
    businessDate: '2026-06-16',
    sku: 'OLD1',
    asin: 'B0OLD00001',
    priority: 'P0',
    status: 'ready_to_fetch',
    terms: ['retirement gifts for women', 'retirement bag'],
    commands: [
      {
        layer: 'selection_keyword_conversion_rate',
        label: 'keyword conversion economics',
        command: 'npm run ops:selection:keyword-conversion -- --keywords "retirement gifts for women,retirement bag"',
        evidenceBoundary: 'read_only_market_evidence',
      },
      {
        layer: 'selection_aba_search_terms',
        label: 'ABA search-term market demand',
        command: 'npm run ops:selection:aba-search-terms -- --search-terms "retirement gifts for women,retirement bag"',
        evidenceBoundary: 'read_only_market_evidence',
      },
    ],
  }],
};

{
  const plan = buildMarketEvidenceRunPlan(queue, {
    businessDate: '2026-06-16',
    outputRoot: 'data/snapshots/old_product_market_evidence_2026-06-16',
  });

  assert.strictEqual(plan.summary.items, 1);
  assert.strictEqual(plan.summary.commands, 2);
  assert.strictEqual(plan.todayQueue.length, 1);
  const task = plan.todayQueue[0];
  assert.strictEqual(task.subject.sku, 'OLD1');
  assert.strictEqual(task.executionPlan.safeToAutoRun, true);
  assert.strictEqual(task.executionPlan.commands.length, 2);
  assert.ok(task.executionPlan.expectedOutputs.every(file => file.includes('old_product_market_evidence_2026-06-16')));

  const conversionCommand = task.executionPlan.commands.find(command => command.layer === 'selection_keyword_conversion_rate');
  assert.ok(conversionCommand.command.includes('--out'));
  assert.ok(conversionCommand.output.endsWith('OLD1_selection_keyword_conversion_rate.json'));
  assert.strictEqual(parseNpmRunCommand(conversionCommand.command).ok, true);

  const runnable = collectRunnableCommands(plan);
  assert.strictEqual(runnable.runnable.length, 2);
  assert.strictEqual(runnable.skipped.length, 0);
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'old-product-market-evidence-aggregate-'));
  fs.writeFileSync(path.join(tmpDir, 'OLD1_selection_keyword_conversion_rate.json'), JSON.stringify({
    ok: true,
    source: 'selection_keyword_conversion_rate',
    rows: [{ keyword: 'retirement gifts for women', marketQuality: 'usable_niche' }],
  }), 'utf8');
  fs.writeFileSync(path.join(tmpDir, 'OLD1_selection_aba_search_terms.json'), JSON.stringify({
    ok: true,
    source: 'selection_aba_search_terms',
    rows: [{ searchTerm: 'retirement gifts for women', demandTier: 'medium' }],
  }), 'utf8');
  fs.writeFileSync(path.join(tmpDir, 'OLD1_selection_keyword_seasonality.json'), JSON.stringify({
    ok: false,
    source: 'selection_keyword_seasonality',
    rows: [{ searchTerm: 'retirement gifts for women', seasonalityType: 'strong_seasonal' }],
  }), 'utf8');

  const reports = buildSelectionReportsFromEvidenceFiles({ evidenceDir: tmpDir });
  const normalized = normalizeSelectionMarketReport(reports);
  assert.strictEqual(reports.summary.files, 3);
  assert.strictEqual(reports.summary.acceptedFiles, 2);
  assert.strictEqual(reports.summary.failedFiles, 1);
  assert.ok(reports.bySku.OLD1);
  assert.strictEqual(reports.bySku.OLD1.summary.acceptedFiles, 2);
  assert.strictEqual(reports.bySku.OLD1.summary.failedFiles, 1);
  assert.ok(normalized.keywordConversion.rows['retirement gifts for women']);
  assert.ok(normalized.abaSearchTerms.rows['retirement gifts for women']);
  assert.strictEqual(normalized.keywordSeasonality.rowCount, 0);
}

{
  assert.strictEqual(parseArgs([
    '--date', '2026-06-16',
    '--aggregate-out', 'data/snapshots/old_product_market_selection_reports_2026-06-16.json',
  ]).aggregateOutFile, 'data/snapshots/old_product_market_selection_reports_2026-06-16.json');
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'old-product-market-evidence-aggregate-cli-'));
  const queueFile = path.join(tmpDir, 'queue.json');
  const hubFile = path.join(tmpDir, 'hub.json');
  const mdFile = path.join(tmpDir, 'hub.md');
  const datedOutputRoot = path.join(tmpDir, 'evidence', '2026-06-16');
  const aggregateFile = path.join(tmpDir, 'selection_reports.json');
  fs.mkdirSync(datedOutputRoot, { recursive: true });
  fs.writeFileSync(queueFile, JSON.stringify(queue, null, 2), 'utf8');
  fs.writeFileSync(path.join(datedOutputRoot, 'OLD1_selection_keyword_conversion_rate.json'), JSON.stringify({
    ok: true,
    source: 'selection_keyword_conversion_rate',
    rows: [{ keyword: 'retirement gifts for women', marketQuality: 'usable_niche' }],
  }), 'utf8');

  const result = runOldProductMarketEvidenceQueue({
    queueFile,
    hubFile,
    markdownFile: mdFile,
    businessDate: '2026-06-16',
    outputRoot: datedOutputRoot,
    aggregateOutFile: aggregateFile,
  });

  assert.strictEqual(result.files.aggregateFile, aggregateFile);
  const aggregate = JSON.parse(fs.readFileSync(aggregateFile, 'utf8'));
  assert.strictEqual(aggregate.summary.evidenceDir, datedOutputRoot);
  assert.strictEqual(aggregate.summary.acceptedFiles, 1);
  assert.strictEqual(aggregate.summary.failedFiles, 0);
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'old-product-market-evidence-'));
  const queueFile = path.join(tmpDir, 'queue.json');
  const hubFile = path.join(tmpDir, 'hub.json');
  const mdFile = path.join(tmpDir, 'hub.md');
  fs.writeFileSync(queueFile, JSON.stringify(queue, null, 2), 'utf8');

  const result = runOldProductMarketEvidenceQueue({
    queueFile,
    hubFile,
    markdownFile: mdFile,
    businessDate: '2026-06-16',
    outputRoot: path.join(tmpDir, 'evidence'),
  });

  assert.strictEqual(result.plan.summary.commands, 2);
  assert.ok(fs.existsSync(hubFile));
  assert.ok(fs.existsSync(mdFile));
  const written = JSON.parse(fs.readFileSync(hubFile, 'utf8'));
  assert.strictEqual(written.todayQueue[0].executionPlan.commands.length, 2);
  assert.ok(fs.readFileSync(mdFile, 'utf8').includes('OLD1'));
}

console.log('old_product_market_evidence_queue.test.js passed');
