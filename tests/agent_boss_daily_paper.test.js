const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  buildCoreMetrics,
  buildGoalFinalContinuity,
  buildVerification,
  defaultPaperFile,
  externalFollowupsDueToday,
  renderBossDailyPaper,
  validateBossPaperGuard,
} = require('../scripts/run_agent_boss_daily_paper');

const today = '2026-05-31';
const paperFile = defaultPaperFile(today, path.join(__dirname, '..', 'data', 'agent'));
const goalFinalTraceRoot = fs.mkdtempSync(path.join(__dirname, 'goal-final-traces-'));
process.on('exit', () => {
  fs.rmSync(goalFinalTraceRoot, { recursive: true, force: true });
});

function writeTraceFile(name, payload = {}) {
  const file = path.join(goalFinalTraceRoot, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(payload, null, 2));
  return file;
}

assert.ok(path.basename(paperFile).includes(today));
assert.notStrictEqual(path.basename(paperFile), '每日结果纸_.md');

const report = {
  today,
  coreMetrics: {
    today,
    todayReliability: 'not_reliable',
    todayInvalidReasons: ['total sales is zero or null', 'seller rows are null'],
    coverage: {
      dataPipeline: {
        denominator: 1,
        numerator: 0,
        gapCount: 1,
        gaps: [{ item: today, reason: 'total sales is zero or null', trace: 'data/raw/seller_sales_core_7d_2026-05-31.json' }],
      },
    },
    latest: {
      date: '2026-05-29',
      sales: 423727.06,
      units: 2899,
      netProfitRate: 0.2009,
      estimatedNetProfit: 85126.77,
      acos: 0.217,
      refundRate: 0.068,
      sourceFile: 'data/raw/seller_sales_core_7d_2026-05-29.json',
    },
    previous: {
      date: '2026-05-28',
      sales: 429831.53,
      units: 2886,
      estimatedNetProfit: 86568.07,
    },
    deltaVsPrevious: {
      sales: -6104.47,
      units: 13,
      estimatedNetProfit: -1441.3,
    },
    trendDelta: {
      startDate: '2026-05-25',
      endDate: '2026-05-29',
      sales: -47970.16,
      units: -302,
      estimatedNetProfit: -8613.4,
    },
  },
  attribution: {
    sourceFile: 'data/snapshots/ad_sku_summary_ALL_7d_2026-05-31.json',
    topDrops: [{
      sku: 'QA3278',
      sales: 189.94,
      salesPrev: 683.77,
      salesGap: 493.83,
      reasons: ['season_or_event=婚礼季(3-6月/8-10月)', 'traffic_down'],
    }],
  },
  actionClosure: {
    status: 'pass',
    executableActions: 61,
    executableWithGoal: 61,
    executableWithCompleteGoal: 61,
    ledgerActionCount: 61,
    reviewTaskCount: 171,
    actionBuckets: { stopLoss: 47, openSource: 14, dueRecheck: 3, other: 0 },
    schemaFile: 'data/snapshots/action_schema_2026-05-31_daily_recovery_combined.json',
    ledgerFile: 'data/agent/agent_ledger_2026-05-31.json',
    coverage: { denominator: 61, numerator: 61, gapCount: 0, gaps: [] },
  },
  lifecycle: {
    status: 'pass',
    sku: 'GT3801',
    verdict: 'goal_met',
    artifactFile: 'data/agent/goal04_real_lifecycle_2026-05-31.json',
  },
  lines: {
    external: {
      total: 24,
      byKind: { keyword_question: 23, developer_product_inquiry: 1 },
      sourceDir: 'data/developer_requests',
      dueFollowupFile: 'data/agent/external_due_followups_2026-05-31.json',
      ledgerFile: 'data/agent/external_ledger_2026-05-31.json',
      queueFile: 'data/agent/external_review_queue_2026-05-31.json',
      coverage: {
        dueFollowups: { denominator: 0, numerator: 0, gapCount: 0, gaps: [] },
      },
      topTasks: [{ sku: 'XUL2303', kind: 'keyword_question', priority: 'P1' }],
    },
    systemP0: {
      sourceFile: 'data/tasks/task_cards.json',
      summary: { count: 40, executable: 39, reviewRequired: 1 },
      coverage: { denominator: 40, numerator: 40, gapCount: 0, gaps: [] },
      topTasks: [{ sku: 'LEM8356', type: 'reserved_page_watch', executable: false }],
    },
    season: {
      sourceFile: 'data/snapshots/ad_sku_summary_ALL_7d_2026-05-31.json',
      listingTaskFile: 'data/tasks/lay2384_250th_independence_title_2026-05-28.json',
      coverage: { denominator: 3, numerator: 3, gapCount: 0, gaps: [] },
      items: [
        { sku: 'GUF3129', lane: 'Independence Day', orders: 1, ordersPrev: 0, sales: 45.99, salesPrev: 0, acos: 0.0709 },
        { sku: 'LAY2384', lane: 'Patriotic', orders: 1, ordersPrev: 12, sales: 16.99, salesPrev: 193.88, acos: 3.3796 },
        { sku: 'ZHW0104', lane: "Father's Day", orders: 0, ordersPrev: 1, sales: 0, salesPrev: 9.99, acos: null },
      ],
    },
  },
  redLights: [{
    title: '2026-05-31 今日销售核心不可直接使用',
    detail: 'total sales is zero or null; seller rows are null',
    trace: 'data/raw/seller_sales_core_7d_2026-05-31.json',
  }],
};

const markdown = renderBossDailyPaper(report);
const sections = markdown.match(/^## /gm) || [];
assert.strictEqual(sections.length, 4);
assert.ok(markdown.includes('## 4. GOAL-FINAL 自证证据'));
assert.ok(markdown.includes('## 1. 总盘：净利/销量'));
assert.ok(markdown.includes('## 2. 三条线：开发诉求 / 系统P0 / 节日巡查'));
assert.ok(markdown.includes('## 3. 红灯（≤5）与追溯'));
assert.ok(markdown.includes('2026-05-31 今日核心销售数据不能当作真实结果'));
assert.ok(markdown.includes('最新可信业务日：2026-05-29'));
assert.ok(markdown.includes('覆盖度自证-数据管道：分母 1，分子 0，缺口 1'));
assert.ok(markdown.includes('覆盖度自证-全量动作闭环：分母 61，分子 61，缺口 0'));
assert.ok(markdown.includes('GT3801'));
assert.ok(markdown.includes('分母独立核验'));
assert.ok(markdown.includes('data/snapshots/action_schema_2026-05-31_daily_recovery_combined.json'));
assert.ok(!markdown.includes('闭环证明'));
assert.ok(!markdown.includes('goal02_stage'));
assert.ok(!markdown.includes('LC1001'));

let continuityMarkdownForGuard = '';
{
  const withContinuity = JSON.parse(JSON.stringify(report));
  withContinuity.goalFinal = {
    status: 'pending',
    currentStreak: 1,
    requiredBusinessDays: 3,
    blockers: [{ date: '2026-05-30', reason: 'missing_boss_daily_paper' }],
  };
  const continuityMarkdown = renderBossDailyPaper(withContinuity);
  continuityMarkdownForGuard = continuityMarkdown;
  assert.ok(continuityMarkdown.includes('GOAL-FINAL 连续达标：1/3'));
  assert.ok(continuityMarkdown.includes('2026-05-30:missing_boss_daily_paper'));
}

assert.deepStrictEqual(
  validateBossPaperGuard({ outFile: paperFile, content: continuityMarkdownForGuard, evidenceFiles: ['data/agent/goal04_real_lifecycle_2026-05-31.json'] }),
  { status: 'pass', failures: [] }
);

assert.strictEqual(validateBossPaperGuard({ outFile: 'data/agent/每日结果纸_.md', content: markdown }).status, 'fail');
assert.strictEqual(validateBossPaperGuard({ outFile: paperFile, content: '闭环证明: 6/6' }).status, 'fail');
assert.strictEqual(validateBossPaperGuard({ outFile: paperFile, content: 'SKU LC1001 lifecycle pass' }).status, 'fail');
assert.strictEqual(validateBossPaperGuard({ outFile: paperFile, content: continuityMarkdownForGuard, evidenceFiles: ['data/agent/goal02_lifecycle_2026-05-31/out.json'] }).status, 'fail');
assert.strictEqual(validateBossPaperGuard({ outFile: paperFile, content: 'SKU <SKU> date <date>' }).status, 'fail');

function makeGoalFinalReadyReport(date) {
  const ready = JSON.parse(JSON.stringify(report));
  ready.today = date;
  ready.generatedAt = `${date}T05:00:00.000Z`;
  ready.coreMetrics.today = date;
  ready.coreMetrics.status = 'ready_today';
  ready.coreMetrics.todayReliability = 'reliable';
  ready.coreMetrics.todayInvalidReasons = [];
  ready.coreMetrics.latestValidDate = date;
  ready.coreMetrics.coverage.dataPipeline = { denominator: 1, numerator: 1, gapCount: 0, gaps: [] };
  ready.coreMetrics.latest.date = date;
  ready.coreMetrics.latest.sourceFile = writeTraceFile(`seller_sales_core_7d_${date}.json`, { date });
  ready.coreMetrics.previous.sourceFile = writeTraceFile(`seller_sales_core_7d_previous_${date}.json`, { date });
  ready.actionClosure.actionBusinessDate = date;
  ready.actionClosure.schemaFile = writeTraceFile(`action_schema_${date}_daily_recovery_combined.json`, []);
  ready.lines.external.outFile = writeTraceFile(`external_inbox_${date}.json`, { date });
  ready.lines.external.dueFollowupFile = writeTraceFile(`external_due_followups_${date}.json`, { date });
  ready.lifecycle.lessonFiles = [`data/learning/sku_lessons/effect_review_${date}_goal_met.json`];
  ready.lifecycle.learningMemoryFile = `data/learning/daily_learning_${date}.json`;
  ready.lines.systemP0.sourceFile = writeTraceFile(`task_cards_${date}.json`, { date });
  ready.lines.season.sourceFile = writeTraceFile(`ad_sku_summary_ALL_7d_${date}.json`, { date });
  ready.todayOps = {
    status: 'already_ready',
    businessDate: date,
    localDate: date,
    manifestStatus: 'success',
    runId: `today_ops_${date}`,
    manifestFile: writeTraceFile(`today_ops_${date}_manifest.json`, {
      status: 'success',
      runId: `today_ops_${date}`,
      businessDate: date,
      time: {
        localDate: date,
        businessDate: date,
        sourceRunId: `today_ops_${date}`,
      },
      outputFiles: {
        dailyRecoveryCombinedSchemaJson: ready.actionClosure.schemaFile,
        taskCardsLatestJson: ready.lines.systemP0.sourceFile,
        summaryFile: writeTraceFile(`today_ops_${date}_summary.json`, { date }),
      },
    }),
    schemaFile: ready.actionClosure.schemaFile,
    taskCardFile: ready.lines.systemP0.sourceFile,
  };
  ready.todayOps.summaryFile = JSON.parse(fs.readFileSync(ready.todayOps.manifestFile, 'utf8')).outputFiles.summaryFile;
  ready.guard = { status: 'pass', failures: [] };
  ready.verification = {
    status: 'pass',
    checks: {
      P1_today_ops_ran_or_ready: true,
      P3_developer_due_followups_each_object_live_trace: true,
      P3_goal_final_coverage_triplets_present: true,
      P3_goal_final_denominator_evidence_present: true,
      P3_goal_final_no_unreasonable_coverage_gaps: true,
    },
  };
  return ready;
}

function writeLiveFollowupTrace(dir, sku, date, overrides = {}) {
  const file = path.join(dir, `developer_request_followup_${sku}_cna_keywords_${date}.json`);
  const payload = {
    exportedAt: `${date}T05:00:00.000Z`,
    ok: true,
    source: {
      targetRows: '/keyword/findAllNew',
      customerSearchTerms: '/customerSearch/targetFindAll',
    },
    dateRange: ['2026-05-29', '2026-05-31'],
    targetRowCount: 1,
    targetRows: [{
      campaignName: `b2b kw broad_cna gifts_${sku}`,
      groupName: `b2b kw broad_cna gifts_${sku}`,
      Impressions: '1',
      Clicks: '0',
      Orders: '0',
    }],
    customerSearchRows: [],
    ...overrides,
  };
  fs.writeFileSync(file, JSON.stringify(payload, null, 2));
  return file;
}

function writeBossPaperPair(dir, date, paperReport = makeGoalFinalReadyReport(date)) {
  const withFiles = {
    ...paperReport,
    goalFinal: paperReport.goalFinal || {
      status: 'pending',
      currentStreak: 1,
      requiredBusinessDays: 3,
      blockers: [],
    },
    files: {
      ...(paperReport.files || {}),
      paperFile: defaultPaperFile(date, dir),
      jsonFile: path.join(dir, `boss_daily_paper_${date}.json`),
    },
  };
  fs.writeFileSync(withFiles.files.paperFile, renderBossDailyPaper(withFiles));
  fs.writeFileSync(withFiles.files.jsonFile, JSON.stringify(withFiles, null, 2));
  return withFiles;
}

{
  const readyMarkdown = renderBossDailyPaper(makeGoalFinalReadyReport('2026-06-01'));
  assert.ok(readyMarkdown.includes('manifest=success'));
  assert.ok(readyMarkdown.includes('paperLocalDate=2026-06-01'));
  assert.ok(readyMarkdown.includes('today_ops_2026-06-01_manifest.json'));
  assert.ok(readyMarkdown.includes('action_schema_2026-06-01_daily_recovery_combined.json'));
  assert.ok(readyMarkdown.includes('task_cards_2026-06-01.json'));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'goal-final-continuity-old-pass-'));
  const current = makeGoalFinalReadyReport('2026-06-01');
  const oldPass = JSON.parse(JSON.stringify(report));
  oldPass.guard = { status: 'pass', failures: [] };
  oldPass.verification = {
    status: 'pass',
    checks: { G_guard_rejects_synthetic_or_placeholder: true },
  };
  fs.writeFileSync(
    path.join(tmpDir, 'boss_daily_paper_2026-05-29.json'),
    JSON.stringify(oldPass, null, 2)
  );
  const continuity = buildGoalFinalContinuity('2026-06-01', tmpDir, current);
  assert.strictEqual(continuity.status, 'pending');
  assert.strictEqual(continuity.currentStreak, 1);
  assert.deepStrictEqual(continuity.daily.map(day => day.date), ['2026-06-01', '2026-05-29', '2026-05-28']);
  assert.strictEqual(continuity.daily[0].pass, true);
  assert.strictEqual(continuity.daily[1].pass, false);
  assert.ok(continuity.blockers.some(item =>
    item.date === '2026-05-29' &&
    item.reason.includes('today_core_not_reliable')
  ));
  assert.ok(continuity.blockers.some(item =>
    item.date === '2026-05-28' &&
    item.reason === 'missing_boss_daily_paper'
  ));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'goal-final-continuity-ready-'));
  writeBossPaperPair(tmpDir, '2026-05-29');
  writeBossPaperPair(tmpDir, '2026-05-28');
  const continuity = buildGoalFinalContinuity('2026-06-01', tmpDir, makeGoalFinalReadyReport('2026-06-01'));
  assert.strictEqual(continuity.status, 'complete');
  assert.strictEqual(continuity.currentStreak, 3);
  assert.deepStrictEqual(continuity.daily.map(day => day.date), ['2026-06-01', '2026-05-29', '2026-05-28']);
  assert.deepStrictEqual(continuity.blockers, []);
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'goal-final-missing-markdown-'));
  fs.writeFileSync(
    path.join(tmpDir, 'boss_daily_paper_2026-05-29.json'),
    JSON.stringify(makeGoalFinalReadyReport('2026-05-29'), null, 2)
  );
  writeBossPaperPair(tmpDir, '2026-05-28');
  const continuity = buildGoalFinalContinuity('2026-06-01', tmpDir, makeGoalFinalReadyReport('2026-06-01'));
  assert.strictEqual(continuity.status, 'pending');
  assert.strictEqual(continuity.currentStreak, 1);
  assert.ok(continuity.blockers.some(item =>
    item.date === '2026-05-29' &&
    item.reason.includes('boss_paper_guard:missing_boss_paper_markdown')
  ));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'goal-final-acceptance-markdown-'));
  fs.writeFileSync(
    path.join(tmpDir, 'boss_daily_paper_2026-05-29.json'),
    JSON.stringify(makeGoalFinalReadyReport('2026-05-29'), null, 2)
  );
  fs.writeFileSync(defaultPaperFile('2026-05-29', tmpDir), 'PASS stage 6 acceptance report');
  writeBossPaperPair(tmpDir, '2026-05-28');
  const continuity = buildGoalFinalContinuity('2026-06-01', tmpDir, makeGoalFinalReadyReport('2026-06-01'));
  assert.strictEqual(continuity.status, 'pending');
  assert.strictEqual(continuity.currentStreak, 1);
  assert.ok(continuity.blockers.some(item =>
    item.date === '2026-05-29' &&
    item.reason.includes('boss_paper_guard:acceptance_report_content')
  ));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'goal-final-incomplete-markdown-'));
  fs.writeFileSync(
    path.join(tmpDir, 'boss_daily_paper_2026-05-29.json'),
    JSON.stringify(makeGoalFinalReadyReport('2026-05-29'), null, 2)
  );
  fs.writeFileSync(defaultPaperFile('2026-05-29', tmpDir), '# 每日结果纸 2026-05-29\n\n## 1. 总盘\n- 今天有数据，但缺少最终自证区。');
  writeBossPaperPair(tmpDir, '2026-05-28');
  const continuity = buildGoalFinalContinuity('2026-06-01', tmpDir, makeGoalFinalReadyReport('2026-06-01'));
  assert.strictEqual(continuity.status, 'pending');
  assert.strictEqual(continuity.currentStreak, 1);
  assert.ok(continuity.blockers.some(item =>
    item.date === '2026-05-29' &&
    item.reason.includes('boss_paper_guard:missing_goal_final_section')
  ));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'goal-final-continuity-backfilled-'));
  const backfilledMay29 = makeGoalFinalReadyReport('2026-05-29');
  backfilledMay29.generatedAt = '2026-06-01T05:00:00.000Z';
  const backfilledMay28 = makeGoalFinalReadyReport('2026-05-28');
  backfilledMay28.generatedAt = '2026-06-01T05:00:00.000Z';
  writeBossPaperPair(tmpDir, '2026-05-29', backfilledMay29);
  writeBossPaperPair(tmpDir, '2026-05-28', backfilledMay28);
  const continuity = buildGoalFinalContinuity('2026-06-01', tmpDir, makeGoalFinalReadyReport('2026-06-01'));
  assert.strictEqual(continuity.status, 'pending');
  assert.strictEqual(continuity.currentStreak, 1);
  assert.ok(continuity.blockers.some(item =>
    item.date === '2026-05-29' &&
    item.reason.includes('boss_paper_not_generated_on_report_date:2026-06-01')
  ));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'goal-final-continuity-skip-today-ops-'));
  writeBossPaperPair(tmpDir, '2026-05-29');
  writeBossPaperPair(tmpDir, '2026-05-28');
  const skipped = makeGoalFinalReadyReport('2026-06-01');
  skipped.todayOps = { attempted: false, status: 'skipped', reason: 'skipTodayOps' };
  skipped.verification.checks.P1_today_ops_ran_or_ready = false;
  const continuity = buildGoalFinalContinuity('2026-06-01', tmpDir, skipped);
  assert.strictEqual(continuity.status, 'pending');
  assert.strictEqual(continuity.currentStreak, 0);
  assert.ok(continuity.blockers.some(item =>
    item.date === '2026-06-01' &&
    item.reason.includes('today_ops_not_run:skipped')
  ));
}

{
  const failedManifest = makeGoalFinalReadyReport('2026-06-01');
  failedManifest.todayOps.manifestStatus = 'failed';
  const verification = buildVerification(failedManifest, { status: 'pass' });
  assert.strictEqual(verification.checks.P1_today_ops_ran_or_ready, false);
  const continuity = buildGoalFinalContinuity('2026-06-01', fs.mkdtempSync(path.join(os.tmpdir(), 'goal-final-failed-manifest-')), failedManifest);
  assert.strictEqual(continuity.currentStreak, 0);
  assert.ok(continuity.blockers.some(item =>
    item.date === '2026-06-01' &&
    item.reason.includes('today_ops_not_run:already_ready')
  ));
}

{
  const forgedManifest = makeGoalFinalReadyReport('2026-06-01');
  const manifest = JSON.parse(fs.readFileSync(forgedManifest.todayOps.manifestFile, 'utf8'));
  manifest.status = 'failed';
  fs.writeFileSync(forgedManifest.todayOps.manifestFile, JSON.stringify(manifest, null, 2));
  forgedManifest.todayOps.manifestStatus = 'success';
  assert.strictEqual(buildVerification(forgedManifest, { status: 'pass' }).checks.P1_today_ops_ran_or_ready, false);
}

{
  const wrongManifestOutput = makeGoalFinalReadyReport('2026-06-01');
  const manifest = JSON.parse(fs.readFileSync(wrongManifestOutput.todayOps.manifestFile, 'utf8'));
  manifest.outputFiles.dailyRecoveryCombinedSchemaJson = writeTraceFile('action_schema_2026-05-30_daily_recovery_combined.json', []);
  fs.writeFileSync(wrongManifestOutput.todayOps.manifestFile, JSON.stringify(manifest, null, 2));
  assert.strictEqual(buildVerification(wrongManifestOutput, { status: 'pass' }).checks.P1_today_ops_ran_or_ready, false);
}

{
  const datedTaskCards = makeGoalFinalReadyReport('2026-06-01');
  const manifest = JSON.parse(fs.readFileSync(datedTaskCards.todayOps.manifestFile, 'utf8'));
  manifest.outputFiles.taskCardsJson = datedTaskCards.todayOps.taskCardFile;
  manifest.outputFiles.taskCardsLatestJson = writeTraceFile('task_cards_latest_overwritten_2026-06-02.json', { date: '2026-06-02' });
  fs.writeFileSync(datedTaskCards.todayOps.manifestFile, JSON.stringify(manifest, null, 2));
  assert.strictEqual(buildVerification(datedTaskCards, { status: 'pass' }).checks.P1_today_ops_ran_or_ready, true);
}

{
  const staleStoredCheck = makeGoalFinalReadyReport('2026-06-01');
  staleStoredCheck.lines.external.coverage.dueFollowups = { denominator: 1, numerator: 1, gapCount: 0, gaps: [] };
  staleStoredCheck.lines.external.todayDueFollowups = [{
    sku: 'UAN0188',
    checkpoint: { date: '2026-06-01' },
    evidence: {
      status: 'red',
      liveChecked: true,
      sku: 'UAN0188',
      label: 'UAN0188 CNA 3d effect review',
      detail: 'stored check says true, but trace file is not present',
      trace: path.join(os.tmpdir(), 'missing_UAN0188_live_trace.json'),
    },
  }];
  staleStoredCheck.verification.checks.P3_developer_due_followups_each_object_live_trace = true;
  const continuity = buildGoalFinalContinuity('2026-06-01', fs.mkdtempSync(path.join(os.tmpdir(), 'goal-final-stale-stored-check-')), staleStoredCheck);
  assert.strictEqual(continuity.currentStreak, 0);
  assert.ok(continuity.blockers.some(item =>
    item.date === '2026-06-01' &&
    item.reason.includes('missing_goal_final_coverage_checks')
  ));
}

{
  const staleRun = makeGoalFinalReadyReport('2026-06-01');
  staleRun.todayOps.localDate = '2026-05-31';
  assert.strictEqual(buildVerification(staleRun, { status: 'pass' }).checks.P1_today_ops_ran_or_ready, false);
}

{
  const mismatchedSchema = makeGoalFinalReadyReport('2026-06-01');
  mismatchedSchema.todayOps.schemaFile = 'data/snapshots/action_schema_2026-05-30_daily_recovery_combined.json';
  assert.strictEqual(buildVerification(mismatchedSchema, { status: 'pass' }).checks.P1_today_ops_ran_or_ready, false);
}

{
  const liveTraceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'goal-final-live-trace-'));
  const liveTraceFile = writeLiveFollowupTrace(liveTraceDir, 'UAN0188', today);
  const okReport = JSON.parse(JSON.stringify(report));
  okReport.lines.external.todayDueFollowupsCount = 1;
  okReport.lines.external.todayDueFollowupsCovered = 1;
  okReport.lines.external.coverage.dueFollowups = { denominator: 1, numerator: 1, gapCount: 0, gaps: [] };
  okReport.lines.external.todayDueFollowups = [{
    sku: 'UAN0188',
    checkpoint: { date: today },
    evidence: {
      status: 'red',
      liveChecked: true,
      sku: 'UAN0188',
      label: 'UAN0188 CNA 3d effect review',
      detail: 'cna week gifts no activity',
      trace: liveTraceFile,
    },
  }];
  assert.strictEqual(buildVerification(okReport, { status: 'pass' }).checks.P3_developer_due_followups_triggered, true);
  assert.strictEqual(buildVerification(okReport, { status: 'pass' }).checks.P3_developer_due_followups_each_object_live_trace, true);
  const okEvidenceMarkdown = renderBossDailyPaper({
    ...okReport,
    goalFinalEvidence: undefined,
    goalFinal: { status: 'pending', currentStreak: 1, requiredBusinessDays: 3, blockers: [] },
  });
  assert.ok(okEvidenceMarkdown.includes('traceMetrics=exportedAt='));
  assert.ok(okEvidenceMarkdown.includes('targetRows=1'));
  assert.ok(okEvidenceMarkdown.includes('searchRows=0'));
  assert.ok(okEvidenceMarkdown.includes('source=/keyword/findAllNew+/customerSearch/targetFindAll'));

  const missingTrace = JSON.parse(JSON.stringify(okReport));
  delete missingTrace.lines.external.todayDueFollowups[0].evidence.trace;
  assert.strictEqual(buildVerification(missingTrace, { status: 'pass' }).checks.P3_developer_due_followups_triggered, false);
  assert.strictEqual(buildVerification(missingTrace, { status: 'pass' }).checks.P3_developer_due_followups_each_object_live_trace, false);

  const staleTrace = JSON.parse(JSON.stringify(okReport));
  staleTrace.lines.external.todayDueFollowups[0].evidence.trace = writeLiveFollowupTrace(liveTraceDir, 'UAN0188', '2026-06-01');
  assert.strictEqual(buildVerification(staleTrace, { status: 'pass' }).checks.P3_developer_due_followups_each_object_live_trace, false);

  const wrongSkuTrace = JSON.parse(JSON.stringify(okReport));
  wrongSkuTrace.lines.external.todayDueFollowups[0].evidence.trace = writeLiveFollowupTrace(liveTraceDir, 'UAN0188', today, {
    targetRows: [{ campaignName: 'b2b kw broad_cna gifts_UAN9999', groupName: 'b2b kw broad_cna gifts_UAN9999' }],
  });
  assert.strictEqual(buildVerification(wrongSkuTrace, { status: 'pass' }).checks.P3_developer_due_followups_each_object_live_trace, false);
}

{
  const gapReport = makeGoalFinalReadyReport('2026-06-01');
  gapReport.lines.systemP0.coverage = { denominator: 2, numerator: 1, gapCount: 1, gaps: [] };
  const gapVerification = buildVerification(gapReport, { status: 'pass' });
  assert.strictEqual(gapVerification.checks.P3_goal_final_coverage_triplets_present, true);
  assert.strictEqual(gapVerification.checks.P3_goal_final_no_unreasonable_coverage_gaps, false);

  gapReport.lines.systemP0.coverage.gaps = [{
    item: 'system-p0-1',
    reason: 'inventory_hard_stop',
    trace: 'data/agent/system_p0_2026-06-01.json',
  }];
  assert.strictEqual(buildVerification(gapReport, { status: 'pass' }).checks.P3_goal_final_no_unreasonable_coverage_gaps, true);

  gapReport.lines.systemP0.coverage.gaps = [{
    item: 'system-p0-1',
    reason: 'skipped because no data today',
    nextStep: 'try again tomorrow',
  }];
  assert.strictEqual(buildVerification(gapReport, { status: 'pass' }).checks.P3_goal_final_no_unreasonable_coverage_gaps, false);

  gapReport.lines.systemP0.coverage.gaps = [{
    item: 'system-p0-1',
    reason: '其实能做但没做',
    trace: writeTraceFile('system_p0_gap_2026-06-01.json', { date: '2026-06-01' }),
  }];
  assert.strictEqual(buildVerification(gapReport, { status: 'pass' }).checks.P3_goal_final_no_unreasonable_coverage_gaps, false);
}

{
  const wrongDateTraceReport = makeGoalFinalReadyReport('2026-06-01');
  wrongDateTraceReport.coreMetrics.latest.sourceFile = writeTraceFile('seller_sales_core_7d_2026-05-31.json', { date: '2026-05-31' });
  assert.strictEqual(buildVerification(wrongDateTraceReport, { status: 'pass' }).checks.P3_goal_final_denominator_evidence_present, false);

  const wrongActionDateReport = makeGoalFinalReadyReport('2026-06-01');
  wrongActionDateReport.actionClosure.schemaFile = writeTraceFile('action_schema_2026-05-30_daily_recovery_combined.json', []);
  wrongActionDateReport.todayOps.schemaFile = wrongActionDateReport.actionClosure.schemaFile;
  assert.strictEqual(buildVerification(wrongActionDateReport, { status: 'pass' }).checks.P3_goal_final_denominator_evidence_present, false);
}

{
  const futureLineReport = makeGoalFinalReadyReport('2026-06-01');
  assert.strictEqual(buildVerification(futureLineReport, { status: 'pass' }).checks.P3_goal_final_coverage_triplets_present, true);
  futureLineReport.lines.futureLine = {
    status: 'pass',
    sourceFile: writeTraceFile('future_line_2026-06-01.json', { date: '2026-06-01' }),
  };
  assert.strictEqual(buildVerification(futureLineReport, { status: 'pass' }).checks.P3_goal_final_coverage_triplets_present, false);

  futureLineReport.lines.futureLine.coverage = { denominator: 2, numerator: 2, gapCount: 0, gaps: [] };
  assert.strictEqual(buildVerification(futureLineReport, { status: 'pass' }).checks.P3_goal_final_coverage_triplets_present, true);
  assert.strictEqual(buildVerification(futureLineReport, { status: 'pass' }).checks.P3_goal_final_denominator_evidence_present, true);

  delete futureLineReport.lines.futureLine.sourceFile;
  assert.strictEqual(buildVerification(futureLineReport, { status: 'pass' }).checks.P3_goal_final_denominator_evidence_present, false);
}

{
  const due = externalFollowupsDueToday([{
    taskId: 'external-request-1',
    title: 'UAN CNA request',
    subject: { sku: 'UAN0188', keyword: 'cna week gifts' },
    reviewPlan: {
      subjectSkus: ['UAN0188', 'UAN2599', 'UAN2600', 'UAN3256', 'UAN3257', 'UAN3644', 'UAN3645', 'UAN3646'],
      checkpoints: [{ date: '2026-06-01', description: '3d effect review' }],
    },
    attachments: ['data/developer_requests/2026-05-28_uan_mininotebook_cna_week_keywords.md'],
  }], '2026-06-01');
  assert.strictEqual(due.length, 8);
  assert.deepStrictEqual(due.map(item => item.sku).sort(), ['UAN0188', 'UAN2599', 'UAN2600', 'UAN3256', 'UAN3257', 'UAN3644', 'UAN3645', 'UAN3646']);
}

{
  let recoveryCalled = false;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'goal04-core-recovery-'));
  const summaryByDate = {
    '2026-06-01': {
      date: '2026-06-01',
      files: { salesCore: 'data/raw/seller_sales_core_7d_2026-06-01.json' },
      missing: [],
      totalAccount: { sales: 0, units: 0 },
      sellers: {},
    },
    '2026-05-31': {
      date: '2026-05-31',
      files: { salesCore: 'data/raw/seller_sales_core_7d_2026-05-31.json' },
      missing: [],
      totalAccount: { sales: 0, units: 0 },
      sellers: {},
    },
    '2026-05-30': {
      date: '2026-05-30',
      files: { salesCore: 'data/raw/seller_sales_core_7d_2026-05-30.json' },
      missing: [],
      totalAccount: { sales: 0, units: 0 },
      sellers: {},
    },
    '2026-05-29': {
      date: '2026-05-29',
      files: { salesCore: 'data/raw/seller_sales_core_7d_2026-05-29.json' },
      missing: [],
      totalAccount: { sales: 423727.06, units: 2899, netProfitRate: 0.2 },
      sellers: {},
    },
  };
  const core = buildCoreMetrics('2026-06-01', {
    lookbackDays: 4,
    summaryByDate,
    disableAutoRecovery: false,
    recoveryFile: path.join(tmpDir, 'core_recovery_2026-06-01.json'),
    recoverCoreData: ({ date }) => {
      recoveryCalled = date === '2026-06-01';
      return { status: 'failed', error: 'forced test failure' };
    },
  });
  assert.strictEqual(recoveryCalled, true);
  assert.strictEqual(core.todayReliability, 'not_reliable');
  assert.strictEqual(core.recovery.attempted, true);
  assert.strictEqual(core.dataBreak.breakStartDate, '2026-05-30');
  assert.strictEqual(core.dataBreak.latestCompleteSettlementDate, '2026-05-29');
  assert.ok(fs.existsSync(path.join(tmpDir, 'core_recovery_2026-06-01.json')));
}

console.log('agent_boss_daily_paper tests passed');
