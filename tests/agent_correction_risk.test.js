const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  buildCorrectionRiskReport,
  correctionEvent,
  persistCorrectionRiskReport,
} = require('../src/agent_correction_risk');
const { parseExternalRequest } = require('../src/agent_external_inbox');
const {
  buildExecutionPlan,
  classifyWorkItem,
} = require('../src/agent_operating_hub');
const {
  collectRunnableCommands,
  parseNpmRunCommand,
} = require('../scripts/run_agent_command_runner');
const { runAgentCorrectionRisk } = require('../scripts/run_agent_correction_risk');

const timeContext = {
  runAt: '2026-05-25T09:00:00.000Z',
  businessDate: '2026-05-25',
  dataDate: '2026-05-24',
  sourceRunId: 'correction-risk-test',
};

const correctionText = [
  'Correction: HAY0218 budget-down was wrong, stale snapshot was used, missing evidence,',
  'already executed, same rule may have affected other SKUs.',
].join(' ');

const riskExcuseCorrectionText = [
  '\u98ce\u9669\u4e0d\u5e94\u8be5\u6210\u4e3a\u501f\u53e3',
  '\u4e0d\u80fd\u56e0\u4e3a\u98ce\u9669\u5c31\u4e0d\u505a\u8be5\u505a\u7684\u8fd0\u8425\u52a8\u4f5c',
  '\u4e0d\u80fd\u53ea\u505a\u4f4e\u98ce\u9669\u7684\u4e8b\u60c5',
  '\u7ecf\u5e38\u8fd9\u6837\u4f1a\u5f71\u54cd\u540e\u7eed\u89c4\u5219',
].join('\uff0c');

{
  const event = correctionEvent({ text: correctionText }, timeContext);
  assert.strictEqual(event.subject.sku, 'HAY0218');
  assert.strictEqual(event.surface, 'ad_budget');
  assert.strictEqual(event.severity, 'critical');
  assert.ok(event.signals.includes('stale_or_wrong_data'));
  assert.ok(event.signals.includes('missing_evidence'));
  assert.ok(event.signals.includes('wrong_or_risky_write'));
  assert.ok(event.signals.includes('repeated_pattern_risk'));
}

{
  const chineseCorrectionText = 'HAY0218 预算降错了，用的是旧数据，没有证据，而且已经执行了，同类 SKU 同样规则可能也会错';
  const event = correctionEvent({ text: chineseCorrectionText }, timeContext);
  assert.strictEqual(event.subject.sku, 'HAY0218');
  assert.strictEqual(event.surface, 'ad_budget');
  assert.strictEqual(event.severity, 'critical');
  assert.ok(event.signals.includes('stale_or_wrong_data'));
  assert.ok(event.signals.includes('missing_evidence'));
  assert.ok(event.signals.includes('wrong_or_risky_write'));
  assert.ok(event.signals.includes('repeated_pattern_risk'));

  const task = parseExternalRequest(chineseCorrectionText, timeContext);
  assert.strictEqual(task.kind, 'operator_correction');
  assert.strictEqual(task.priority, 'P0');
}

{
  const report = buildCorrectionRiskReport({ text: correctionText }, timeContext);
  assert.strictEqual(report.summary.severity, 'critical');
  assert.strictEqual(report.summary.freezeSameRuleAutoExecute, true);
  assert.ok(report.audit.categories.includes('data_freshness_risk'));
  assert.ok(report.audit.categories.includes('execution_decision_risk'));
  assert.ok(report.audit.categories.includes('systemic_rule_risk'));
  assert.ok(report.audit.requiredChecks.includes('scan_last_7_to_30_days_for_same_rule_or_same_reason_actions'));
  assert.ok(report.audit.immediateControls.includes('freeze_same_rule_auto_execute_until_audit_closes'));
  assert.ok(report.tasks.some(task => task.kind === 'operator_correction_risk_audit'));
  assert.ok(report.tasks.some(task => task.kind === 'same_rule_scan'));
  assert.ok(report.tasks.some(task => task.kind === 'rollback_or_secondary_action_review'));
  assert.ok(report.learningPatch.doNotApplyWhen.includes('same rule has an unresolved correction audit'));
  assert.strictEqual(report.results[0].ok, true);
}

{
  const report = buildCorrectionRiskReport({ text: riskExcuseCorrectionText }, timeContext);
  assert.strictEqual(report.summary.severity, 'high');
  assert.strictEqual(report.correction.surface, 'agent_operating_behavior');
  assert.ok(report.correction.signals.includes('risk_as_inaction_excuse'));
  assert.ok(report.correction.signals.includes('repeated_pattern_risk'));
  assert.ok(report.audit.categories.includes('operating_underreach_risk'));
  assert.ok(report.audit.requiredChecks.includes('classify_risk_as_execution_design_not_stop_reason'));
  assert.ok(report.audit.requiredChecks.includes('route_supported_operating_action_to_evidence_boundary_dry_run_execute_or_explicit_blocker'));
  assert.ok(report.audit.immediateControls.includes('risk_level_must_not_be_used_as_do_nothing_reason'));
  assert.ok(report.audit.immediateControls.includes('supported_operating_actions_must_route_to_execution_path'));
  assert.strictEqual(report.summary.freezeSameRuleAutoExecute, false);
  assert.ok(report.tasks.some(task => task.kind === 'execution_path_repair'));
  assert.ok(report.learningPatch.doNotApplyWhen.includes('risk level is the only reason to skip a supported operating action'));
  assert.ok(report.learningPatch.operatingPrinciple.includes('Risk is routing, not refusal'));

  const task = parseExternalRequest(riskExcuseCorrectionText, timeContext);
  assert.strictEqual(task.kind, 'operator_correction');
  assert.strictEqual(task.priority, 'P0');
  assert.ok(task.evidenceRequirements.includes('supported_action_execution_path_review'));
  assert.ok(task.authorizationHint.includes('risk_is_routing_not_refusal'));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-correction-risk-'));
  const outFile = path.join(tmpDir, 'correction_risk.json');
  const mdFile = path.join(tmpDir, 'correction_risk.md');
  const learningDir = path.join(tmpDir, 'learning');
  const report = runAgentCorrectionRisk({
    text: correctionText,
    outFile,
    mdFile,
    learningDir,
    timeContext,
  });
  assert.ok(fs.existsSync(outFile));
  assert.ok(fs.existsSync(mdFile));
  assert.ok(fs.existsSync(report.files.learningJsonFile));
  assert.ok(fs.existsSync(report.files.learningMdFile));
  const persisted = JSON.parse(fs.readFileSync(outFile, 'utf8'));
  assert.strictEqual(persisted.summary.requiresImmediateControl, true);
  assert.ok(persisted.results[0].outputFiles.includes(outFile));
}

{
  const task = parseExternalRequest(correctionText, timeContext);
  assert.strictEqual(task.kind, 'operator_correction');
  assert.strictEqual(task.priority, 'P0');
  assert.ok(task.evidenceRequirements.includes('correction_risk_audit'));
  assert.ok(task.authorizationHint.includes('freeze_same_rule_auto_execute_until_audit_closes'));

  const classified = classifyWorkItem(task, { today: '2026-05-25' });
  assert.ok(classified.requiredCapabilities.includes('agent::correction_risk::audit::read'));
  assert.ok(classified.executionPlan.commands.some(command => command.command.includes('ops:agent:correction-risk')));

  const plan = buildExecutionPlan(task, { today: '2026-05-25' });
  assert.strictEqual(plan.safeToAutoRun, true);
  assert.strictEqual(plan.commands[0].riskLevel, 'read_only');
  assert.ok(plan.expectedOutputs.some(file => file.includes('correction_risk_2026-05-25.json')));
}

{
  const parsed = parseNpmRunCommand('npm run ops:agent:correction-risk -- --text "Correction HAY0218 stale snapshot wrong budget" --today 2026-05-25 --out data\\agent\\correction_risk_2026-05-25.json');
  assert.strictEqual(parsed.ok, true);
  assert.strictEqual(parsed.script, 'ops:agent:correction-risk');
  assert.ok(parsed.args[0].endsWith(path.join('scripts', 'run_agent_correction_risk.js')));

  const hub = {
    todayQueue: [{
      taskId: 'correction-task',
      executionPlan: {
        safeToAutoRun: true,
        commands: [{
          label: 'correction audit',
          command: 'npm run ops:agent:correction-risk -- --text "Correction HAY0218 stale snapshot wrong budget" --today 2026-05-25 --out data\\agent\\correction_risk_2026-05-25.json',
          output: 'data\\agent\\correction_risk_2026-05-25.json',
          riskLevel: 'read_only',
        }],
      },
    }],
  };
  const collected = collectRunnableCommands(hub);
  assert.strictEqual(collected.runnable.length, 1);
  assert.strictEqual(collected.skipped.length, 0);
}

console.log('agent_correction_risk tests passed');
