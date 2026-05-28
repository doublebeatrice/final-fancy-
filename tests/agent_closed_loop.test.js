const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  buildDailyClosureStatus,
  inspectKpiSnapshotQuality,
  parseArgs,
  runAgentClosedLoop,
} = require('../scripts/run_agent_closed_loop');

const timeContext = {
  runAt: '2026-05-19T13:20:00.000Z',
  businessDate: '2026-05-19',
  dataDate: '2026-05-18',
  sourceRunId: 'agent-closed-loop-test',
};

{
  const status = buildDailyClosureStatus({
    kpiStatus: 'off_track',
    depositStatus: 'partial',
    depositMissingCount: 3,
    operatingClosureStatus: 'needs_recovery',
  });
  assert.strictEqual(status.dailyClosureStatus, 'partial');
  assert.strictEqual(status.dailyComplete, false);
  assert.ok(status.dailyClosureReasons.includes('deposit_partial'));
  assert.ok(status.dailyClosureReasons.includes('deposit_missing_raw'));
  assert.ok(status.dailyClosureReasons.includes('kpi_off_track'));
}

{
  const parsed = parseArgs(['node', 'scripts/run_agent_closed_loop.js', '--adjustments', 'data/adjustments/adjustments_2026-05-20.json']);
  assert.strictEqual(parsed.adjustmentsFile, 'data/adjustments/adjustments_2026-05-20.json');
}

{
  const parsed = parseArgs(['node', 'scripts/run_agent_closed_loop.js', '--prior-learning-memory', 'data/agent/learning_memory_2026-05-18.json']);
  assert.strictEqual(parsed.priorLearningMemoryFile, 'data/agent/learning_memory_2026-05-18.json');
}

{
  const parsed = parseArgs([
    'node',
    'scripts/run_agent_closed_loop.js',
    '--landed-action-conflict-date',
    '2026-05-21',
    '--landed-action-conflict-audit',
    'data/tasks/landed_action_conflict_audit_2026-05-21.json',
    '--landed-action-conflict-md',
    'data/tasks/landed_action_conflict_audit_2026-05-21.md',
  ]);
  assert.strictEqual(parsed.landedActionConflictAuditDate, '2026-05-21');
  assert.strictEqual(parsed.landedActionConflictAuditFile, 'data/tasks/landed_action_conflict_audit_2026-05-21.json');
  assert.strictEqual(parsed.landedActionConflictAuditMarkdownFile, 'data/tasks/landed_action_conflict_audit_2026-05-21.md');
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-closed-loop-prior-learning-'));
  const priorLearningMemoryFile = path.join(tmpDir, 'learning_memory_2026-05-18.json');
  fs.writeFileSync(priorLearningMemoryFile, JSON.stringify({
    status: 'active_watch',
    summary: { constraints: 1, blockers: 0, warnings: 1 },
    nextRunBrief: {
      mustReadBeforeDecision: ['data/learning/daily_learning_2026-05-18.json'],
      doNotApplyWhen: ['do not treat prior dry-run as landed'],
      evidenceBeforeReuse: ['fresh snapshot'],
    },
    tasks: [{
      taskId: 'learning-1',
      lane: 'learning_memory',
      kind: 'learning_constraint',
      status: 'new',
      priority: 'P1',
      title: 'do not treat prior dry-run as landed',
      evidenceRequirements: ['fresh snapshot'],
    }],
  }), 'utf8');

  const result = runAgentClosedLoop({
    timeContext,
    outDir: tmpDir,
    priorLearningMemoryFile,
    generateDashboard: false,
    generateAutonomyAudit: false,
    snapshot: {
      businessDate: '2026-05-19',
      dataDate: '2026-05-18',
      productCards: [{ sku: 'SKU1' }],
      sellerSalesRows: [{ seller_title: 'total', order_sales: '10', sale_num: '1' }],
    },
    execFileSync: () => '',
  });

  assert.strictEqual(result.summary.priorLearningMemoryApplied, true);
  assert.strictEqual(result.summary.priorLearningConstraintTasks, 1);
  assert.strictEqual(result.hub.summary.learningConstraintTasks, 1);
  assert.ok(result.priorLearningContext.mustReadBeforeDecision.some(file => file.includes('daily_learning_2026-05-18.json')));
}

{
  const quality = inspectKpiSnapshotQuality({
    sellerSalesRows: [{
      seller_title: '所选编号汇总',
      order_sales: '0.00',
      sale_num: '0',
    }],
  });
  assert.strictEqual(quality.suspiciousZeroSellerSalesTotal, true);
  assert.strictEqual(quality.usableSellerSales, false);
}

{
  const quality = inspectKpiSnapshotQuality({
    sellerSalesRows: [
      { seller_title: 'HJ大组', net_profit: '0.2075' },
      { seller_title: 'HJ17-黄成喆', order_sales: '183978.40', sale_num: '1281' },
    ],
  });
  assert.strictEqual(quality.suspiciousZeroSellerSalesTotal, false);
  assert.strictEqual(quality.usableSellerSales, true);
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-closed-loop-conflict-date-'));
  const result = runAgentClosedLoop({
    timeContext: {
      ...timeContext,
      localDate: '2026-05-21',
      businessDate: '2026-05-20',
      dataDate: '2026-05-19',
      sourceRunId: 'agent-closed-loop-conflict-date-test',
    },
    outDir: tmpDir,
    generateDashboard: false,
    snapshot: {
      businessDate: '2026-05-20',
      dataDate: '2026-05-19',
      productCards: [{ sku: 'SKU1' }],
      sellerSalesRows: [{
        seller_title: 'total',
        order_sales: '525427.69',
        sale_num: '3663',
        net_profit: '0.1941',
        refund_percent: '0.0546',
        ACOS: '0.1998',
        ROAS: '5.0059',
        SP: '0.3112',
        advCost: '0.1012',
      }],
    },
    execFileSync: () => '',
  });
  assert.ok(result.files.landedActionConflictAuditFile.endsWith('landed_action_conflict_audit_2026-05-20.json'));
  assert.ok(result.files.landedActionConflictAuditMarkdownFile.endsWith('landed_action_conflict_audit_2026-05-20.md'));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-closed-loop-conflict-adjustment-date-'));
  const adjustmentsFile = path.join(tmpDir, 'adjustments_2026-05-21.json');
  fs.writeFileSync(adjustmentsFile, JSON.stringify([]), 'utf8');
  const result = runAgentClosedLoop({
    timeContext: {
      ...timeContext,
      localDate: '2026-05-21',
      businessDate: '2026-05-20',
      dataDate: '2026-05-19',
      sourceRunId: 'agent-closed-loop-conflict-adjustment-date-test',
    },
    adjustmentsFile,
    outDir: tmpDir,
    generateDashboard: false,
    snapshot: {
      businessDate: '2026-05-20',
      dataDate: '2026-05-19',
      productCards: [{ sku: 'SKU1' }],
      sellerSalesRows: [{
        seller_title: 'total',
        order_sales: '525427.69',
        sale_num: '3663',
        net_profit: '0.1941',
        refund_percent: '0.0546',
        ACOS: '0.1998',
        ROAS: '5.0059',
        SP: '0.3112',
        advCost: '0.1012',
      }],
    },
    execFileSync: () => '',
  });
  assert.ok(result.files.landedActionConflictAuditFile.endsWith('landed_action_conflict_audit_2026-05-21.json'));
  assert.ok(result.files.landedActionConflictAuditMarkdownFile.endsWith('landed_action_conflict_audit_2026-05-21.md'));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-closed-loop-'));
  const keywordOut = path.join(tmpDir, 'selection_keyword_conversion_rate_2026-05-19.json');
  const writeOut = path.join(tmpDir, 'write_execution.json');
  const handoffOut = path.join(tmpDir, 'handoff.md');
  const calls = [];
  const result = runAgentClosedLoop({
    timeContext,
    hub: {
      businessDate: '2026-05-19',
      dataDate: '2026-05-18',
      summary: { total: 1, externalRequests: 1 },
      todayQueue: [{
        taskId: 'ext-1',
        title: '开发问 LOW1 能不能继续推',
        lane: 'external_inbox',
        workType: 'external_request',
        priority: 'P1',
        status: 'new',
        nextStep: '先拉选品证据再判断。',
        executionPlan: {
          safeToAutoRun: true,
          commands: [{
            label: '拉选品关键词转化证据',
            command: 'npm run ops:selection:keyword-conversion -- --keywords "nurse gifts"',
            output: keywordOut,
            riskLevel: 'read_only',
          }],
        },
      }],
    },
    ledger: {
      actions: [{
        sku: 'LOW1',
        actionType: 'pause',
        entityType: 'productAd',
        approvedBy: 'codex',
        actionSource: ['codex'],
        evidence: ['7d spend no orders'],
      }],
    },
    actionSchemaFile: path.join(tmpDir, 'action_schema.json'),
    snapshotFile: path.join(tmpDir, 'latest_snapshot.json'),
    outDir: tmpDir,
    writeExecutionOutFile: writeOut,
    handoffOutFile: handoffOut,
    generateDashboard: false,
    adjustments: [{
      businessDate: '2026-05-19',
      localDate: '2026-05-20',
      runAt: '2026-05-20T04:30:00.000Z',
      sourceRunId: 'agent-closed-loop-dashboard-test-actions',
      sku: 'SKU1',
      actionType: 'pause',
      entityType: 'keyword',
      outcome: 'success',
    }],
    snapshot: {
      businessDate: '2026-05-19',
      dataDate: '2026-05-18',
      productCards: [{ sku: 'SKU1' }],
      sellerSalesRows: [{
        seller_title: '所选编号汇总',
        order_sales: '525427.69',
        sale_num: '3663',
        net_profit: '0.1941',
        refund_percent: '0.0546',
        ACOS: '0.1998',
        ROAS: '5.0059',
        SP: '0.3112',
        advCost: '0.1012',
      }],
    },
    execFileSync: (bin, args) => {
      calls.push({ bin, args });
      if (args[0] && args[0].endsWith(path.join('scripts', 'execute', 'fetch_selection_keyword_conversion_rate.js'))) {
        fs.writeFileSync(keywordOut, JSON.stringify({ ok: true, rows: [] }), 'utf8');
        return JSON.stringify({ ok: true, outputFile: keywordOut, message: '选品证据已生成。' });
      }
      if (args.includes('scripts\\execute\\run_actions.js') || args.includes('scripts/execute/run_actions.js')) {
        return '[adjustment-log] appended 1 records';
      }
      return '';
    },
  });

  assert.strictEqual(result.summary.closedLoop, true);
  assert.strictEqual(result.summary.dailyClosureStatus, 'needs_recovery');
  assert.strictEqual(result.summary.dailyComplete, false);
  assert.ok(result.summary.dailyClosureReasons.includes('kpi_off_track'));
  assert.strictEqual(result.commandResults.summary.executed, 1);
  assert.strictEqual(result.feedback.summary.feedbackApplied, 1);
  assert.strictEqual(result.writeExecution.summary.executedStages, 1);
  assert.strictEqual(result.summary.kpiStatus, 'off_track');
  assert.strictEqual(result.summary.kpiRequiredMode, 'active_recovery_with_profit_guardrails');
  assert.strictEqual(result.summary.dataFreshnessStatus, 'previous_day');
  assert.strictEqual(result.summary.snapshotStale, false);
  assert.strictEqual(result.summary.operatingClosureStatus, 'needs_recovery');
  assert.ok(result.summary.operatingClosureWarnings.includes('kpi_off_track'));
  assert.strictEqual(result.summary.recoveryGateStatus, 'target_set');
  assert.strictEqual(result.summary.recoveryGateTargetBusinessDate, '2026-05-20');
  assert.strictEqual(result.summary.recoveryGateSalesTarget, 541080.88);
  assert.strictEqual(result.summary.recoveryGateAcosMax, 0.1977);
  assert.strictEqual(result.summary.depositStatus, '');
  assert.strictEqual(result.summary.depositMissingCount, 0);
  assert.ok(result.handoff.markdown.includes('开发问 LOW1'));
  assert.ok(result.handoff.markdown.includes('选品证据已生成'));
  assert.ok(result.handoff.markdown.includes('写入链路'));
  assert.ok(fs.existsSync(result.files.commandResultsFile));
  assert.ok(fs.existsSync(result.files.feedbackFile));
  assert.ok(fs.existsSync(handoffOut));
  assert.ok(calls.length >= 2);
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-closed-loop-review-queue-'));
  const calls = [];
  const result = runAgentClosedLoop({
    timeContext: {
      ...timeContext,
      businessDate: '2026-05-20',
      dataDate: '2026-05-19',
      sourceRunId: 'agent-closed-loop-review-queue-test',
    },
    ledger: {
      businessDate: '2026-05-20',
      nextOpenTasks: [{
        taskId: 'review-queue-1',
        source: 'effect_review',
        lane: 'effect_review',
        kind: 'effect_review',
        status: 'waiting_review',
        dueDate: '2026-05-20',
        title: 'QUEUE1 1日效果复查',
        subject: { sku: 'QUEUE1' },
        reviewPlan: { metrics: ['orders'], rollbackIf: 'spend rises without orders' },
      }],
    },
    outDir: tmpDir,
    generateDashboard: false,
    depositStatus: { status: 'complete', missing: [], suspicious: [] },
    snapshot: {
      businessDate: '2026-05-20',
      dataDate: '2026-05-19',
      productCards: [{ sku: 'QUEUE1' }],
      sellerSalesRows: [{
        seller_title: 'total',
        order_sales: '525427.69',
        sale_num: '3663',
        net_profit: '0.1941',
        refund_percent: '0.0546',
        ACOS: '0.1998',
        ROAS: '5.0059',
        SP: '0.3112',
        advCost: '0.1012',
      }],
    },
    execFileSync: (bin, args) => {
      calls.push({ bin, args });
      if (args[0] && args[0].endsWith(path.join('scripts', 'run_agent_effect_review.js'))) {
        const queueFile = args[args.indexOf('--queue') + 1];
        const outFile = args[args.indexOf('--out') + 1];
        const queue = JSON.parse(fs.readFileSync(queueFile, 'utf8'));
        assert.strictEqual(queue.summary.due, 1);
        assert.strictEqual(queue.due[0].subject.sku, 'QUEUE1');
        fs.mkdirSync(path.dirname(outFile), { recursive: true });
        fs.writeFileSync(outFile, JSON.stringify({
          today: '2026-05-20',
          summary: { total: 1, byVerdict: { continue_watch: 1 }, byStatus: { waiting_review: 1 }, needsAction: 0, blocked: 0 },
          results: [{ taskId: 'review-queue-1', verdict: 'continue_watch', status: 'waiting_review', nextStep: 'continue watch' }],
        }), 'utf8');
        return JSON.stringify({ ok: true, outFile, summary: { total: 1, byVerdict: { continue_watch: 1 }, byStatus: { waiting_review: 1 }, needsAction: 0, blocked: 0 } });
      }
      return JSON.stringify({ ok: true });
    },
  });

  assert.ok(fs.existsSync(result.files.reviewQueueFile));
  const effectResult = result.commandResults.results.find(item => item.command.includes('ops:agent:review-effect'));
  assert.ok(effectResult);
  assert.strictEqual(effectResult.report.verdict, 'continue_watch');
  assert.strictEqual(result.handoff.summary.reviewResults, 1);
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-closed-loop-stale-'));
  const result = runAgentClosedLoop({
    timeContext: {
      ...timeContext,
      businessDate: '2026-05-20',
      dataDate: '2026-05-18',
      sourceRunId: 'agent-closed-loop-stale-test',
    },
    hub: {
      businessDate: '2026-05-20',
      dataDate: '2026-05-18',
      summary: { total: 0 },
      todayQueue: [],
    },
    outDir: tmpDir,
    generateDashboard: false,
    adjustments: [{
      businessDate: '2026-05-19',
      localDate: '2026-05-20',
      runAt: '2026-05-20T04:30:00.000Z',
      sourceRunId: 'agent-closed-loop-dashboard-test-actions',
      sku: 'SKU1',
      actionType: 'pause',
      entityType: 'keyword',
      outcome: 'success',
    }],
    snapshot: {
      businessDate: '2026-05-20',
      dataDate: '2026-05-18',
      productCards: [{ sku: 'SKU1' }],
      sellerSalesRows: [{
        seller_title: '所选编号汇总',
        order_sales: '525427.69',
        sale_num: '3663',
        net_profit: '0.1941',
        refund_percent: '0.0546',
        ACOS: '0.1998',
        ROAS: '5.0059',
        SP: '0.3112',
        advCost: '0.1012',
      }],
    },
    execFileSync: () => '',
  });
  assert.strictEqual(result.summary.closedLoop, true);
  assert.strictEqual(result.summary.snapshotStale, true);
  assert.strictEqual(result.summary.operatingClosureStatus, 'partial');
  assert.ok(result.summary.operatingClosureWarnings.includes('snapshot_stale'));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-closed-loop-dashboard-'));
  const snapshotFile = path.join(tmpDir, 'snapshot.json');
  const summaryFile = path.join(tmpDir, 'summary.json');
  const conflictFile = path.join(tmpDir, 'landed_action_conflict_audit_2026-05-20.json');
  const conflictMarkdownFile = path.join(tmpDir, 'landed_action_conflict_audit_2026-05-20.md');
  fs.writeFileSync(snapshotFile, JSON.stringify({
    productCards: [{ sku: 'SKU1' }],
    sellerSalesRows: [{
      seller_title: '所选编号汇总',
      order_sales: '525427.69',
      sale_num: '3663',
      net_profit: '0.1941',
      refund_percent: '0.0546',
      ACOS: '0.1998',
      ROAS: '5.0059',
      SP: '0.3112',
      advCost: '0.1012',
    }],
  }), 'utf8');
  fs.writeFileSync(summaryFile, JSON.stringify({
    time: { localDate: '2026-05-20', businessDate: '2026-05-19', dataDate: '2026-05-18' },
    outputFiles: { snapshotFile },
    warnings: [],
    dailyLearning: { baselineQuality: 'warning' },
    totalProductCards: 1,
    allowedScopeSkuCount: 1,
    proactiveOperatingAudit: {},
    overBudgetCoverage: { counts: {}, snapshotRows: 0, actionableCampaigns: 0, matchedActionCount: 0 },
  }), 'utf8');
  fs.writeFileSync(conflictFile, JSON.stringify({
    date: '2026-05-20',
    summary: {
      liveRows: 1,
      latestRunId: 'agent-closed-loop-dashboard-test-actions',
      latestRunRows: 1,
      sameEntityMultiCount: 0,
      sameEntityReverseCount: 0,
      sameNameReverseDifferentEntityCount: 0,
      latestRunMixedSkuCount: 0,
      status: 'clear',
    },
    sameEntityReverse: [],
    sameNameReverseDifferentEntity: [],
  }, null, 2), 'utf8');
  fs.writeFileSync(conflictMarkdownFile, [
    '# Landed action conflict audit - 2026-05-20',
    '',
    '- Status: clear',
    '- Same entity reverse conflicts: 0',
    '- Same-name mixed direction groups: 0',
  ].join('\n'), 'utf8');
  const result = runAgentClosedLoop({
    timeContext: {
      ...timeContext,
      businessDate: '2026-05-20',
      dataDate: '2026-05-18',
      sourceRunId: 'agent-closed-loop-dashboard-test',
    },
    hub: {
      businessDate: '2026-05-20',
      dataDate: '2026-05-18',
      summary: { total: 0 },
      todayQueue: [],
    },
    outDir: tmpDir,
    dashboardOutDir: tmpDir,
    dashboardSummaryFile: summaryFile,
    landedActionConflictAuditFile: conflictFile,
    landedActionConflictAuditMarkdownFile: conflictMarkdownFile,
    adjustments: [{
      businessDate: '2026-05-19',
      localDate: '2026-05-20',
      runAt: '2026-05-20T04:30:00.000Z',
      sourceRunId: 'agent-closed-loop-dashboard-test-actions',
      sku: 'SKU1',
      actionType: 'pause',
      entityType: 'keyword',
      outcome: 'success',
    }],
    snapshot: JSON.parse(fs.readFileSync(snapshotFile, 'utf8')),
    execFileSync: () => '',
  });
  assert.strictEqual(result.summary.dashboardReady, true);
  assert.strictEqual(result.outputDate, '2026-05-20');
  assert.strictEqual(result.localDate, '2026-05-20');
  assert.strictEqual(result.businessDate, '2026-05-19');
  assert.strictEqual(result.dataDate, '2026-05-18');
  assert.strictEqual(result.handoff.businessDate, '2026-05-19');
  assert.strictEqual(result.handoff.dataDate, '2026-05-18');
  assert.strictEqual(result.handoff.dataFreshness.dataLagDays, 1);
  assert.strictEqual(result.summary.dailyClosureStatus, 'needs_recovery');
  assert.ok(!result.summary.dailyClosureReasons.includes('snapshot_stale'));
  assert.ok(!result.summary.dailyClosureReasons.includes('data_quality_warning'));
  assert.strictEqual(result.summary.dataLagDays, 1);
  assert.strictEqual(result.summary.snapshotStale, false);
  assert.ok(result.files.dashboardFile.endsWith('daily_dashboard_2026-05-20.html'));
  assert.ok(fs.existsSync(result.files.dashboardFile));
  assert.ok(result.files.closureVerificationFile.endsWith('daily_closure_verify_2026-05-20.json'));
  assert.ok(fs.existsSync(result.files.closureVerificationFile));
  assert.ok(result.files.kpiGateFile.endsWith('kpi_recovery_gate_2026-05-20.json'));
  assert.ok(fs.existsSync(result.files.kpiGateFile));
  assert.ok(result.files.kpiCheckpointFile.endsWith('kpi_recovery_checkpoint_2026-05-20.json'));
  assert.ok(fs.existsSync(result.files.kpiCheckpointFile));
  assert.ok(result.files.kpiOperatorCheckpointFile.endsWith('kpi_recovery_operator_checkpoint_2026-05-20.md'));
  assert.ok(fs.existsSync(result.files.kpiOperatorCheckpointFile));
  assert.ok(result.files.kpiOperatorCheckpointFile.startsWith(tmpDir));
  assert.strictEqual(result.kpiRecoveryGate.status, 'target_set_actual_pending');
  assert.strictEqual(result.summary.kpiGateStatus, 'target_set_actual_pending');
  assert.strictEqual(result.summary.kpiGateEvaluatedBusinessDate, '2026-05-19');
  assert.strictEqual(result.kpiRecoveryCheckpoint.status, 'needs_recovery');
  assert.strictEqual(result.kpiRecoveryCheckpoint.kpiGate.status, 'target_set_actual_pending');
  assert.strictEqual(result.summary.kpiCheckpointStatus, 'needs_recovery');
  assert.strictEqual(result.summary.kpiCheckpointGateStatus, 'target_set_actual_pending');
  assert.ok(result.handoff.markdown.includes('## KPI Gate'));
  assert.ok(result.handoff.markdown.includes('target_set_actual_pending'));
  assert.strictEqual(result.summary.artifactVerificationOk, true);
  assert.deepStrictEqual(result.summary.artifactVerificationErrors, []);
  assert.strictEqual(result.handoff.dashboardReady, true);
  assert.ok(result.handoff.markdown.includes('## Artifact Verification'));
  assert.ok(result.handoff.markdown.includes('artifactVerificationOk=true'));
  assert.ok(result.handoff.markdown.includes('## Dashboard'));
  assert.ok(result.handoff.markdown.includes('daily_dashboard_2026-05-20.html'));
  assert.ok(result.handoff.markdown.includes('- status: ready'));
  const html = fs.readFileSync(result.files.dashboardFile, 'utf8');
  assert.ok(html.includes('运营闭环'));
  assert.ok(html.includes('partial') || html.includes('needs_recovery'));
  assert.ok(html.includes('closedLoop=true'));
  assert.ok(html.includes('artifactVerificationOk=true'));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-closed-loop-local-date-default-'));
  const result = runAgentClosedLoop({
    timeContext: {
      runAt: '2026-05-20T04:30:00.000Z',
      localDate: '2026-05-20',
      businessDate: '2026-05-19',
      dataDate: '2026-05-18',
      sourceRunId: 'agent-closed-loop-local-date-default-test',
    },
    hub: {
      businessDate: '2026-05-19',
      dataDate: '2026-05-18',
      summary: { total: 0 },
      todayQueue: [],
    },
    outDir: tmpDir,
    generateDashboard: false,
    adjustments: [],
    snapshot: {
      businessDate: '2026-05-19',
      dataDate: '2026-05-18',
      productCards: [{ sku: 'SKU1' }],
      sellerSalesRows: [{
        seller_title: 'total',
        order_sales: '525427.69',
        sale_num: '3663',
        net_profit: '0.1941',
        refund_percent: '0.0546',
        ACOS: '0.1998',
        ROAS: '5.0059',
        SP: '0.3112',
        advCost: '0.1012',
      }],
    },
    execFileSync: () => '',
  });

  assert.strictEqual(result.outputDate, '2026-05-20');
  assert.strictEqual(result.localDate, '2026-05-20');
  assert.strictEqual(result.businessDate, '2026-05-19');
  assert.ok(result.files.closedLoopFile.endsWith('agent_closed_loop_2026-05-20.json'));
  assert.ok(result.files.handoffOutFile.endsWith('agent_handoff_2026-05-20.md'));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-closed-loop-deposit-'));
  const trendRoot = path.join(tmpDir, 'trend');
  const rawRoot = path.join(trendRoot, 'raw');
  const rawDir = path.join(rawRoot, '5-20');
  fs.mkdirSync(rawDir, { recursive: true });
  fs.writeFileSync(path.join(rawDir, 'seller_sales_from_snapshot_2026-05-20.csv'), 'sku,sales\nA,1\n', 'utf8');
  fs.writeFileSync(path.join(rawDir, 'inv_auto_filtered_from_snapshot_2026-05-20.csv'), 'sku,inv\nA,1\n', 'utf8');
  fs.writeFileSync(path.join(rawDir, 'ad_sku_summary_from_snapshot_2026-05-20.csv'), 'sku,cost\nA,1\n', 'utf8');
  fs.writeFileSync(path.join(rawDir, 'seller_success_rate_HJ17_2026-05-20.json'), '{}', 'utf8');
  fs.writeFileSync(path.join(rawDir, 'seller_success_rate_HJ17_2026-05-20.csv'), 'seller,total\nHJ17,1\n', 'utf8');
  fs.writeFileSync(path.join(rawDir, 'daily_deposit_manifest_2026-05-20.json'), '{}', 'utf8');
  fs.mkdirSync(path.join(trendRoot, 'daily'), { recursive: true });
  fs.writeFileSync(path.join(trendRoot, 'daily', '2026-05-20.html'), '<html></html>', 'utf8');
  const snapshotFile = path.join(tmpDir, 'snapshot_2026-05-20.json');
  fs.writeFileSync(snapshotFile, JSON.stringify({
    productCards: [{ sku: 'SKU1' }],
    sellerSalesRows: [{
      seller_title: 'total',
      order_sales: '525427.69',
      sale_num: '3663',
      net_profit: '0.1941',
      refund_percent: '0.0546',
      ACOS: '0.1998',
      ROAS: '5.0059',
      SP: '0.3112',
      advCost: '0.1012',
    }],
    adSkuSummaryRows: [{ sku: 'SKU1' }],
  }), 'utf8');

  const result = runAgentClosedLoop({
    timeContext: {
      ...timeContext,
      businessDate: '2026-05-20',
      dataDate: '2026-05-18',
      sourceRunId: 'agent-closed-loop-deposit-test',
    },
    hub: {
      businessDate: '2026-05-20',
      dataDate: '2026-05-18',
      summary: { total: 0 },
      todayQueue: [],
    },
    outDir: tmpDir,
    dashboardOutDir: tmpDir,
    generateDepositStatus: true,
    depositTrendRoot: trendRoot,
    depositRawRoot: rawRoot,
    snapshotFile,
    snapshot: JSON.parse(fs.readFileSync(snapshotFile, 'utf8')),
    adjustments: [],
    execFileSync: () => '',
  });

  assert.strictEqual(result.handoff.summary.depositStatus, 'partial');
  assert.strictEqual(result.summary.depositStatus, 'partial');
  assert.strictEqual(result.summary.dailyClosureStatus, 'partial');
  assert.strictEqual(result.summary.dailyComplete, false);
  assert.ok(result.summary.dailyClosureReasons.includes('deposit_partial'));
  assert.ok(result.summary.dailyClosureReasons.includes('deposit_missing_raw'));
  assert.strictEqual(result.summary.depositMissingCount, result.handoff.depositStatus.missing.length);
  assert.strictEqual(result.summary.depositSuspiciousCount, result.handoff.depositStatus.suspicious.length);
  assert.ok(result.summary.depositMissing.includes('sales_core_original_xlsx'));
  assert.ok(result.summary.depositMissing.includes('inventory_original_csv'));
  assert.ok(result.summary.depositMissing.includes('ad_full_original_csv'));
  assert.ok(result.summary.depositSuspicious.includes('sales_core_is_snapshot_derived'));
  assert.ok(result.files.depositStatusFile.endsWith('daily_deposit_status_2026-05-20.json'));
  assert.ok(fs.existsSync(result.files.depositStatusFile));
  assert.ok(result.files.rawRecoveryQueueFile.endsWith('raw_recovery_queue_2026-05-20.json'));
  assert.ok(result.files.rawRecoveryQueueFile.startsWith(tmpDir));
  assert.ok(result.files.rawRecoveryMarkdownFile.endsWith('raw_recovery_queue_2026-05-20.md'));
  assert.ok(result.files.rawRecoveryMarkdownFile.startsWith(tmpDir));
  assert.ok(fs.existsSync(result.files.rawRecoveryQueueFile));
  assert.ok(fs.existsSync(result.files.rawRecoveryMarkdownFile));
  const rawRecoveryQueue = JSON.parse(fs.readFileSync(result.files.rawRecoveryQueueFile, 'utf8'));
  const rawRecoveryMarkdown = fs.readFileSync(result.files.rawRecoveryMarkdownFile, 'utf8');
  assert.strictEqual(rawRecoveryQueue.status, 'open');
  assert.ok(rawRecoveryQueue.items.some(item => item.missingClass === 'sales_core_original_xlsx'));
  assert.ok(rawRecoveryMarkdown.includes('Status: open'));
  assert.ok(rawRecoveryMarkdown.includes('sales_core_original_xlsx'));
  assert.ok(result.handoff.markdown.includes('sales_core_original_xlsx'));
  assert.ok(result.handoff.markdown.includes('dailyClosureStatus: partial'));
  assert.ok(result.handoff.markdown.includes('dailyComplete=false'));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-closed-loop-deposit-archive-'));
  const trendRoot = path.join(tmpDir, 'trend');
  const rawRoot = path.join(trendRoot, 'raw');
  const rawDir = path.join(rawRoot, '5-20');
  const downloadRoot = path.join(tmpDir, 'downloads');
  fs.mkdirSync(rawDir, { recursive: true });
  fs.writeFileSync(path.join(rawDir, 'seller_sales_from_snapshot_2026-05-20.csv'), 'sku,sales\nA,1\n', 'utf8');
  fs.writeFileSync(path.join(rawDir, 'inv_auto_filtered_from_snapshot_2026-05-20.csv'), 'sku,inv\nA,1\n', 'utf8');
  fs.writeFileSync(path.join(rawDir, 'ad_sku_summary_from_snapshot_2026-05-20.csv'), 'sku,cost\nA,1\n', 'utf8');
  fs.writeFileSync(path.join(rawDir, 'seller_success_rate_HJ17_2026-05-20.json'), '{}', 'utf8');
  fs.writeFileSync(path.join(rawDir, 'seller_success_rate_HJ17_2026-05-20.csv'), 'seller,total\nHJ17,1\n', 'utf8');
  fs.writeFileSync(path.join(rawDir, 'daily_deposit_manifest_2026-05-20.json'), '{}', 'utf8');
  fs.mkdirSync(path.join(trendRoot, 'daily'), { recursive: true });
  fs.writeFileSync(path.join(trendRoot, 'daily', '2026-05-20.html'), '<html></html>', 'utf8');
  fs.mkdirSync(downloadRoot, { recursive: true });
  fs.writeFileSync(path.join(downloadRoot, 'table-export (21).xlsx'), 'xlsx', 'utf8');
  fs.writeFileSync(path.join(downloadRoot, 'inv_auto_filtered_2026-05-20-09-30-00.csv'), 'x'.repeat(1024 * 1024 + 1), 'utf8');
  fs.writeFileSync(path.join(downloadRoot, 'ad_sku_summary_30d_2026-05-20.csv'), 'sku,cost\nA,1\n', 'utf8');
  fs.utimesSync(path.join(downloadRoot, 'table-export (21).xlsx'), new Date('2026-05-20T09:20:00'), new Date('2026-05-20T09:20:00'));
  fs.utimesSync(path.join(downloadRoot, 'inv_auto_filtered_2026-05-20-09-30-00.csv'), new Date('2026-05-20T09:30:00'), new Date('2026-05-20T09:30:00'));
  fs.utimesSync(path.join(downloadRoot, 'ad_sku_summary_30d_2026-05-20.csv'), new Date('2026-05-20T09:31:00'), new Date('2026-05-20T09:31:00'));
  const snapshotFile = path.join(tmpDir, 'snapshot_2026-05-20.json');
  fs.writeFileSync(snapshotFile, JSON.stringify({
    productCards: [{ sku: 'SKU1' }],
    sellerSalesRows: [{
      seller_title: 'total',
      order_sales: '525427.69',
      sale_num: '3663',
      net_profit: '0.1941',
      refund_percent: '0.0546',
      ACOS: '0.1998',
      ROAS: '5.0059',
      SP: '0.3112',
      advCost: '0.1012',
    }],
    adSkuSummaryRows: [{ sku: 'SKU1' }],
  }), 'utf8');

  const result = runAgentClosedLoop({
    timeContext: {
      ...timeContext,
      businessDate: '2026-05-20',
      dataDate: '2026-05-20',
      sourceRunId: 'agent-closed-loop-deposit-archive-test',
    },
    hub: {
      businessDate: '2026-05-20',
      dataDate: '2026-05-20',
      summary: { total: 0 },
      todayQueue: [],
    },
    outDir: tmpDir,
    dashboardOutDir: tmpDir,
    generateDepositStatus: true,
    archiveDepositCandidates: true,
    depositTrendRoot: trendRoot,
    depositRawRoot: rawRoot,
    rawCandidateRoots: [downloadRoot],
    rawCandidateDays: 1,
    snapshotFile,
    snapshot: JSON.parse(fs.readFileSync(snapshotFile, 'utf8')),
    adjustments: [],
    execFileSync: () => '',
  });

  assert.strictEqual(result.summary.depositStatus, 'complete');
  assert.strictEqual(result.summary.depositMissingCount, 0);
  assert.ok(fs.existsSync(path.join(rawDir, 'table-export (21).xlsx')));
  assert.ok(fs.existsSync(path.join(rawDir, 'inv_auto_filtered_2026-05-20-09-30-00.csv')));
  assert.ok(fs.existsSync(path.join(rawDir, 'ad_sku_summary_30d_2026-05-20.csv')));
  const depositStatus = JSON.parse(fs.readFileSync(result.files.depositStatusFile, 'utf8'));
  assert.strictEqual(depositStatus.rawCandidateArchive.copied.length, 3);
  assert.strictEqual(depositStatus.status, 'complete');
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-closed-loop-dryrun-sync-'));
  const snapshotFile = path.join(tmpDir, 'snapshot.json');
  const summaryFile = path.join(tmpDir, 'summary.json');
  const actionSchemaFile = path.join(tmpDir, 'action_schema.json');
  const adjustmentsFile = path.join(tmpDir, 'adjustments_2026-05-20.json');
  const conflictFile = path.join(tmpDir, 'landed_action_conflict_audit_2026-05-20.json');
  const conflictMarkdownFile = path.join(tmpDir, 'landed_action_conflict_audit_2026-05-20.md');
  fs.writeFileSync(snapshotFile, JSON.stringify({
    productCards: [{ sku: 'LIVE1' }, { sku: 'BLOCK1' }, { sku: 'APPROVE1' }, { sku: 'WATCH1' }, { sku: 'BUDGET1' }],
    sellerSalesRows: [{
      seller_title: 'total',
      order_sales: '525427.69',
      sale_num: '3663',
      net_profit: '0.1941',
      refund_percent: '0.0546',
      ACOS: '0.1998',
      ROAS: '5.0059',
      SP: '0.3112',
      advCost: '0.1012',
    }],
  }), 'utf8');
  fs.writeFileSync(summaryFile, JSON.stringify({
    time: { localDate: '2026-05-20', businessDate: '2026-05-20', dataDate: '2026-05-19' },
    outputFiles: { snapshotFile },
    warnings: [],
    dailyLearning: { baselineQuality: 'warning' },
    totalProductCards: 4,
    allowedScopeSkuCount: 4,
    proactiveOperatingAudit: {},
    overBudgetCoverage: { counts: {}, snapshotRows: 0, actionableCampaigns: 0, matchedActionCount: 0 },
  }), 'utf8');
  fs.writeFileSync(actionSchemaFile, JSON.stringify([{
    sku: 'BUDGET1',
    actions: [{
      entityType: 'campaign',
      actionType: 'budget',
      id: 'budget-campaign-1',
      campaignName: 'profitable capped campaign',
      currentBudget: 10,
      suggestedBudget: 12.5,
      evidence: [
        'campaign spend=50 sales=500 orders=12 clicks=80',
        'acos=10% profitRate=25%',
        'invDays=45 units7=10 units30=80',
      ],
    }],
  }], null, 2), 'utf8');
  fs.writeFileSync(adjustmentsFile, JSON.stringify([
    {
      businessDate: '2026-05-20',
      localDate: '2026-05-20',
      runAt: '2026-05-20T07:34:48.533Z',
      sourceRunId: 'ops_test_high_efficiency',
      sku: 'LIVE1',
      actionType: 'bid',
      entityType: 'keyword',
      entityId: 'live-1',
      entityName: 'kw_live1',
      beforeValue: 0.2,
      afterValue: 0.22,
      outcome: 'success',
    },
    {
      businessDate: '2026-05-20',
      localDate: '2026-05-20',
      runAt: '2026-05-20T07:34:48.533Z',
      sourceRunId: 'ops_test_high_efficiency',
      dryRun: true,
      sku: 'BLOCK1',
      actionType: 'bid',
      entityType: 'keyword',
      entityId: 'block-1',
      entityName: 'kw_block1',
      beforeValue: 0.3,
      afterValue: 0.33,
      reason: 'high_efficiency_small_bid_up orders7=1 acos7=0.05 invDays=20 netProfit=0.2 busyNetProfit=0.18',
    },
    {
      businessDate: '2026-05-20',
      localDate: '2026-05-20',
      runAt: '2026-05-20T07:34:48.533Z',
      sourceRunId: 'ops_test_high_efficiency',
      dryRun: true,
      sku: 'APPROVE1',
      actionType: 'bid',
      entityType: 'keyword',
      entityId: 'approve-1',
      entityName: 'kw_approve1',
      beforeValue: 0.4,
      afterValue: 0.43,
      reason: 'high_efficiency_small_bid_up orders7=1 acos7=0.04 invDays=80 netProfit=0.2 busyNetProfit=0.18',
    },
    {
      businessDate: '2026-05-20',
      localDate: '2026-05-20',
      runAt: '2026-05-20T07:34:48.533Z',
      sourceRunId: 'ops_test_high_efficiency',
      dryRun: true,
      sku: 'WATCH1',
      actionType: 'bid',
      entityType: 'autoTarget',
      entityId: 'watch-1',
      entityName: 'auto_watch1',
      beforeValue: 0.18,
      afterValue: 0.2,
      reason: 'high_efficiency_small_bid_up orders7=1 acos7=0.03 invDays=60 netProfit=0.18 busyNetProfit=0.16',
    },
  ], null, 2), 'utf8');
  fs.writeFileSync(conflictFile, JSON.stringify({
    date: '2026-05-20',
    summary: {
      liveRows: 1,
      latestRunId: 'ops_test_high_efficiency',
      latestRunRows: 1,
      sameEntityMultiCount: 0,
      sameEntityReverseCount: 0,
      sameNameReverseDifferentEntityCount: 1,
      latestRunMixedSkuCount: 0,
      status: 'review_needed',
    },
    sameEntityReverse: [],
    sameNameReverseDifferentEntity: [{ sku: 'APPROVE1', entityType: 'keyword', entityName: 'kw_approve1' }],
  }, null, 2), 'utf8');
  fs.writeFileSync(conflictMarkdownFile, [
    '# Landed action conflict audit - 2026-05-20',
    '',
    '- Status: review_needed',
    '## Same-name mixed direction review',
    '',
    'mixed_direction_review',
  ].join('\n'), 'utf8');

  const result = runAgentClosedLoop({
    timeContext: {
      ...timeContext,
      businessDate: '2026-05-20',
      dataDate: '2026-05-19',
      sourceRunId: 'agent-closed-loop-dryrun-sync-test',
    },
    hub: {
      businessDate: '2026-05-20',
      dataDate: '2026-05-19',
      summary: { total: 0 },
      todayQueue: [],
    },
    outDir: tmpDir,
    dashboardOutDir: tmpDir,
    dashboardSummaryFile: summaryFile,
    ledger: {
      actions: [{
        sku: 'BUDGET1',
        entityType: 'campaign',
        actionType: 'budget',
        id: 'budget-campaign-1',
      }],
    },
    actionSchemaFile,
    adjustmentsFile,
    landedActionConflictAuditFile: conflictFile,
    landedActionConflictAuditMarkdownFile: conflictMarkdownFile,
    snapshot: JSON.parse(fs.readFileSync(snapshotFile, 'utf8')),
    execFileSync: () => '',
  });

  assert.strictEqual(result.summary.artifactVerificationOk, true);
  assert.deepStrictEqual(result.summary.artifactVerificationErrors, []);
  assert.deepStrictEqual(result.summary.intermediateArtifactVerificationErrors, []);
  assert.strictEqual(result.kpiRecoveryCheckpoint.actionPools.recoveryDryRun.highEfficiencyBidUps, 3);
  assert.strictEqual(result.summary.recoveryDryRunDecisionTotal, 3);
  assert.strictEqual(result.summary.recoveryDryRunDecisionApprovalNeeded, 1);
  assert.strictEqual(result.summary.recoveryDryRunDecisionBlocked, 1);
  assert.strictEqual(result.summary.kpiApprovalReviewReady, true);
  assert.strictEqual(result.summary.kpiApprovalReviewTotal, 1);
  assert.strictEqual(result.summary.kpiApprovalRecommendApprove, 1);
  assert.strictEqual(result.summary.kpiApprovalReviewApprovalNeeded, 0);
  assert.strictEqual(result.summary.kpiRecoveryNextActionsReady, true);
  assert.ok(result.files.kpiApprovalReviewFile.endsWith('kpi_approval_review_2026-05-20.json'));
  assert.ok(result.files.kpiApprovalReviewMarkdownFile.endsWith('kpi_approval_review_2026-05-20.md'));
  assert.ok(fs.existsSync(result.files.kpiApprovalReviewFile));
  assert.ok(result.files.kpiRecoveryNextActionsFile.endsWith('kpi_recovery_next_actions_2026-05-20.md'));
  assert.ok(fs.existsSync(result.files.kpiRecoveryNextActionsFile));
  assert.strictEqual(result.summary.monthKpiDigestReady, true);
  assert.ok(result.files.monthKpiDigestFile.endsWith('month_kpi_operator_digest_2026-05-20.json'));
  assert.ok(result.files.monthKpiDigestMarkdownFile.endsWith('month_kpi_operator_digest_2026-05-20.md'));
  assert.ok(fs.existsSync(result.files.monthKpiDigestFile));
  assert.ok(fs.existsSync(result.files.monthKpiDigestMarkdownFile));
  const monthDigest = fs.readFileSync(result.files.monthKpiDigestMarkdownFile, 'utf8');
  assert.ok(monthDigest.includes('月 KPI 运营摘要'));
  assert.ok(monthDigest.includes('KPI 仍未追回'));
  const nextActions = fs.readFileSync(result.files.kpiRecoveryNextActionsFile, 'utf8');
  assert.ok(nextActions.includes('## Already Landed'));
  assert.ok(nextActions.includes('## High-Priority Watch Pool'));
  assert.ok(nextActions.includes('## Blocked Pool'));
  assert.ok(nextActions.includes('## True Approval Needed'));
  assert.ok(result.handoff.markdown.includes('KPI Recovery Dry Run'));
  assert.ok(result.handoff.markdown.includes('highEfficiencyBidUps 3'));
  assert.ok(result.handoff.markdown.includes('KPI Dry-Run Decision Split'));
  assert.ok(result.handoff.markdown.includes('KPI Approval Review'));
  assert.ok(result.handoff.markdown.includes('recommendApprove 1'));
  const operatorCheckpoint = fs.readFileSync(result.files.kpiOperatorCheckpointFile, 'utf8');
  assert.ok(operatorCheckpoint.includes('## KPI approval review'));
  assert.ok(operatorCheckpoint.includes('recommendApprove 1; approvalNeeded 0; hold 0; blocked 0'));
  const html = fs.readFileSync(result.files.dashboardFile, 'utf8');
  assert.ok(html.includes('KPI recovery dry-run: highEfficiencyBidUps 3'));
  assert.ok(html.includes('KPI dry-run decision split: total 3'));
  assert.ok(html.includes('KPI approval review'));
  assert.ok(html.includes('recommendApprove 1'));
  assert.ok(html.includes('Month KPI digest'));
  assert.ok(html.includes('month_kpi_operator_digest_2026-05-20.md'));
  const closureVerify = JSON.parse(fs.readFileSync(result.files.closureVerificationFile, 'utf8'));
  assert.strictEqual(closureVerify.ok, true);
  assert.strictEqual(closureVerify.summary.recoveryDryRunHighEfficiencyBidUps, 3);
  assert.strictEqual(closureVerify.summary.recoveryDryRunDecisionTotal, 3);
  assert.strictEqual(closureVerify.summary.kpiApprovalReviewReady, true);
  assert.strictEqual(closureVerify.summary.kpiApprovalReviewTotal, 1);
  assert.strictEqual(closureVerify.summary.monthKpiDigestReady, true);
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-closed-loop-artifact-fail-'));
  const snapshotFile = path.join(tmpDir, 'snapshot.json');
  const summaryFile = path.join(tmpDir, 'summary.json');
  fs.writeFileSync(snapshotFile, JSON.stringify({
    productCards: [{ sku: 'SKU1' }],
    sellerSalesRows: [{
      seller_title: '鎵€閫夌紪鍙锋眹鎬?',
      order_sales: '525427.69',
      sale_num: '3663',
      net_profit: '0.1941',
      refund_percent: '0.0546',
      ACOS: '0.1998',
      ROAS: '5.0059',
      SP: '0.3112',
      advCost: '0.1012',
    }],
  }), 'utf8');
  fs.writeFileSync(summaryFile, JSON.stringify({
    time: { localDate: '2026-05-20', businessDate: '2026-05-19', dataDate: '2026-05-18' },
    outputFiles: { snapshotFile },
    warnings: [],
    dailyLearning: { baselineQuality: 'warning' },
    totalProductCards: 1,
    allowedScopeSkuCount: 1,
    proactiveOperatingAudit: {},
    overBudgetCoverage: { counts: {}, snapshotRows: 0, actionableCampaigns: 0, matchedActionCount: 0 },
  }), 'utf8');
  const result = runAgentClosedLoop({
    timeContext: {
      ...timeContext,
      businessDate: '2026-05-20',
      dataDate: '2026-05-18',
      sourceRunId: 'agent-closed-loop-artifact-fail-test',
    },
    hub: {
      businessDate: '2026-05-20',
      dataDate: '2026-05-18',
      summary: { total: 0 },
      todayQueue: [],
    },
    outDir: tmpDir,
    dashboardOutDir: tmpDir,
    dashboardSummaryFile: summaryFile,
    adjustments: [],
    snapshot: JSON.parse(fs.readFileSync(snapshotFile, 'utf8')),
    verifyDailyClosureArtifacts: () => ({
      ok: false,
      errors: ['dashboard businessDate mismatch'],
      summary: {},
    }),
    execFileSync: () => '',
  });

  assert.strictEqual(result.closedLoop, false);
  assert.strictEqual(result.summary.closedLoop, false);
  assert.strictEqual(result.summary.artifactVerificationOk, false);
  assert.deepStrictEqual(result.summary.artifactVerificationErrors, ['dashboard businessDate mismatch']);
  assert.ok(result.files.closureVerificationFile.endsWith('daily_closure_verify_2026-05-20.json'));
}

console.log('agent_closed_loop tests passed');
