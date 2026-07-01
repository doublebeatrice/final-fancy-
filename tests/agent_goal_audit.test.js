const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  buildGoalAudit,
  parseArgs,
  runAgentGoalAudit,
} = require('../scripts/run_agent_goal_audit');
const { parseNpmRunCommand } = require('../scripts/run_agent_command_runner');

const timeContext = {
  runAt: '2026-05-25T08:00:00.000Z',
  businessDate: '2026-05-25',
  dataDate: '2026-05-24',
  sourceRunId: 'agent-goal-audit-test',
};

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function fixture(tmpDir, overrides = {}) {
  const files = {
    supervisorFile: path.join(tmpDir, 'unattended_supervisor_2026-05-25.json'),
    readinessFile: path.join(tmpDir, 'agent_readiness_audit_2026-05-25.json'),
    completionFile: path.join(tmpDir, 'agent_completion_audit_2026-05-25.json'),
    scheduleInstallFile: path.join(tmpDir, 'unattended_schedule_install_2026-05-25.json'),
    learningMemoryFile: path.join(tmpDir, 'learning_memory_2026-05-25.json'),
    correctionRiskFile: path.join(tmpDir, 'correction_risk_2026-05-25.json'),
    unattendedGateFile: path.join(tmpDir, 'unattended_gate_2026-05-25.json'),
  };
  const supervisor = {
    ok: true,
    status: 'needs_recovery',
    closedLoop: {
      closedLoop: true,
      commandFailed: 0,
      writeFailed: 0,
      writeBlocked: 0,
      artifactVerificationOk: true,
      priorLearningMemoryApplied: true,
    },
  };
  const readiness = {
    ok: true,
    status: 'ready_with_warnings',
    summary: {
      liveScheduleReady: true,
      scheduledRuntimeReady: true,
      correctionReady: true,
      coverageSufficiencyReady: true,
    },
    checks: [
      { id: 'agent_closed_loop_control_plane', status: 'pass' },
      { id: 'live_unattended_schedule', status: 'pass' },
      { id: 'coverage_sufficiency_correction_memory', status: 'pass' },
    ],
  };
  const completion = {
    ok: false,
    status: 'not_ready',
    summary: {
      schedulerOk: false,
      readinessOk: false,
      completionAuditTaskRuntimeReady: false,
      scheduledTaskInvocationOk: false,
      naturalScheduledRuntimeReady: false,
    },
  };
  const scheduleInstall = {
    ok: true,
    status: 'ready',
    installedTask: {
      triggerEnabled: true,
      actionArguments: 'run_agent_unattended_supervisor.js --out-dir data\\agent --execute --execute-if-ready',
      nextRunTime: '05/26/2026 09:30:30',
      lastTaskResult: '0',
    },
  };
  const learningMemory = {
    status: 'active_watch',
    summary: { constraints: 8, blockers: 0, corrections: 1 },
    nextRunBrief: {
      mustReadBeforeDecision: ['data\\learning\\corrections\\risk.json'],
      doNotApplyWhen: [
        'risk level is the only reason to skip a supported operating action',
        'coverage sufficiency has not been answered before action landing details',
      ],
      evidenceBeforeReuse: [
        'route_supported_operating_action_to_evidence_boundary_dry_run_execute_or_explicit_blocker',
        'coverage_ratio',
      ],
    },
  };
  const correctionRisk = {
    correction: { signals: ['risk_as_inaction_excuse'] },
    audit: {
      severity: 'high',
      immediateControls: ['risk_level_must_not_be_used_as_do_nothing_reason'],
    },
    tasks: [{ kind: 'execution_path_repair' }],
  };
  writeJson(files.supervisorFile, { ...supervisor, ...(overrides.supervisor || {}) });
  writeJson(files.readinessFile, { ...readiness, ...(overrides.readiness || {}) });
  writeJson(files.completionFile, { ...completion, ...(overrides.completion || {}) });
  writeJson(files.scheduleInstallFile, { ...scheduleInstall, ...(overrides.scheduleInstall || {}) });
  writeJson(files.learningMemoryFile, { ...learningMemory, ...(overrides.learningMemory || {}) });
  writeJson(files.correctionRiskFile, { ...correctionRisk, ...(overrides.correctionRisk || {}) });
  writeJson(files.unattendedGateFile, { decision: 'no_actions' });
  return files;
}

{
  const parsed = parseArgs([
    'node',
    'scripts/run_agent_goal_audit.js',
    '--today',
    '2026-05-25',
    '--out-dir',
    'data\\agent',
  ]);
  assert.strictEqual(parsed.today, '2026-05-25');
  assert.strictEqual(parsed.agentDir, 'data\\agent');
}

{
  const parsed = parseNpmRunCommand('npm run ops:agent:goal-audit -- --today 2026-05-25 --out data\\agent\\agent_goal_audit_2026-05-25.json');
  assert.strictEqual(parsed.ok, true);
  assert.strictEqual(parsed.script, 'ops:agent:goal-audit');
  assert.ok(parsed.args[0].endsWith(path.join('scripts', 'run_agent_goal_audit.js')));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-goal-audit-pending-'));
  const files = fixture(tmpDir);
  const report = buildGoalAudit({
    today: '2026-05-25',
    agentDir: tmpDir,
    ...files,
  }, timeContext);
  assert.strictEqual(report.ok, false);
  assert.strictEqual(report.status, 'pending_natural_trigger');
  assert.strictEqual(report.summary.pending, 1);
  assert.strictEqual(report.requirements.find(item => item.id === 'natural_unattended_completion').status, 'pending');
  assert.strictEqual(report.requirements.find(item => item.id === 'risk_is_routing_not_refusal').status, 'pass');
  assert.strictEqual(report.requirements.find(item => item.id === 'coverage_sufficiency_first').status, 'pass');
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-goal-audit-risk-learning-memory-'));
  const files = fixture(tmpDir, {
    correctionRisk: {
      correction: { signals: [] },
      audit: {
        severity: 'medium',
        immediateControls: [],
      },
      tasks: [{ kind: 'operator_correction_risk_audit' }],
    },
  });
  const report = buildGoalAudit({
    today: '2026-05-25',
    agentDir: tmpDir,
    ...files,
  }, timeContext);
  assert.strictEqual(report.requirements.find(item => item.id === 'risk_is_routing_not_refusal').status, 'pass');
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-goal-audit-complete-'));
  const files = fixture(tmpDir, {
    readiness: {
      ok: true,
      status: 'ready',
      summary: {
        liveScheduleReady: true,
        scheduledRuntimeReady: true,
        correctionReady: true,
        coverageSufficiencyReady: true,
      },
      checks: [
        { id: 'agent_closed_loop_control_plane', status: 'pass' },
        { id: 'coverage_sufficiency_correction_memory', status: 'pass' },
      ],
    },
    completion: {
      ok: true,
      status: 'complete_ready',
      summary: {
        schedulerOk: true,
        readinessOk: true,
        completionAuditTaskRuntimeReady: true,
        scheduledTaskInvocationOk: true,
        naturalScheduledRuntimeReady: true,
      },
    },
  });
  const report = buildGoalAudit({
    today: '2026-05-25',
    agentDir: tmpDir,
    ...files,
  }, timeContext);
  assert.strictEqual(report.ok, true);
  assert.strictEqual(report.status, 'complete_ready');
  assert.strictEqual(report.summary.failed, 0);
  assert.strictEqual(report.summary.pending, 0);
  assert.strictEqual(report.summary.coverageSufficiencyReady, true);
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-goal-audit-coverage-fail-'));
  const files = fixture(tmpDir, {
    readiness: {
      summary: {
        liveScheduleReady: true,
        scheduledRuntimeReady: true,
        correctionReady: true,
        coverageSufficiencyReady: false,
      },
      checks: [
        { id: 'agent_closed_loop_control_plane', status: 'pass' },
        { id: 'coverage_sufficiency_correction_memory', status: 'fail' },
      ],
    },
    learningMemory: {
      nextRunBrief: {
        mustReadBeforeDecision: ['data\\learning\\corrections\\risk.json'],
        doNotApplyWhen: ['risk level is the only reason to skip a supported operating action'],
        evidenceBeforeReuse: ['route_supported_operating_action_to_evidence_boundary_dry_run_execute_or_explicit_blocker'],
      },
    },
  });
  const report = buildGoalAudit({
    today: '2026-05-25',
    agentDir: tmpDir,
    ...files,
  }, timeContext);
  const requirement = report.requirements.find(item => item.id === 'coverage_sufficiency_first');
  assert.strictEqual(report.ok, false);
  assert.strictEqual(report.status, 'not_ready');
  assert.strictEqual(report.summary.coverageSufficiencyReady, false);
  assert.strictEqual(requirement.status, 'fail');
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-goal-audit-run-'));
  const files = fixture(tmpDir);
  const outFile = path.join(tmpDir, 'goal.json');
  const markdownFile = path.join(tmpDir, 'goal.md');
  const report = runAgentGoalAudit({
    timeContext,
    today: '2026-05-25',
    agentDir: tmpDir,
    outFile,
    markdownFile,
    ...files,
  });
  assert.strictEqual(report.status, 'pending_natural_trigger');
  assert.ok(fs.existsSync(outFile));
  assert.ok(fs.existsSync(markdownFile));
}

console.log('agent_goal_audit tests passed');
