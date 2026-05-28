const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  buildAgentLearningMemory,
  renderAgentLearningMemoryMarkdown,
} = require('../src/agent_learning_memory');
const { parseNpmRunCommand } = require('../scripts/run_agent_command_runner');
const { runAgentLearningMemory } = require('../scripts/run_agent_learning_memory');

const timeContext = {
  runAt: '2026-05-25T08:00:00.000Z',
  businessDate: '2026-05-25',
  dataDate: '2026-05-25',
  sourceRunId: 'agent-learning-memory-test',
};

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-learning-memory-'));
  const learningFile = path.join(tmpDir, 'daily_learning_2026-05-25.json');
  const autonomyAuditFile = path.join(tmpDir, 'autonomy_audit_2026-05-25.json');
  const correctionDir = path.join(tmpDir, 'corrections');
  const skuLessonDir = path.join(tmpDir, 'sku_lessons');
  writeJson(learningFile, {
    time: { businessDate: '2026-05-25', dataDate: '2026-05-25' },
    dataQuality: { warnings: ['seller_sales_rows_missing'] },
    decisions: {
      actionQuality: { status: 'dry_run_only' },
      operatingClosure: { status: 'primary_plan_ready' },
    },
    carryForward: { openQuestions: ['Did budget increases recover profitable orders?'] },
  });
  writeJson(autonomyAuditFile, {
    checks: [{
      id: 'write_execution_gate',
      status: 'warning',
      severity: 'warning',
      title: 'Write execution is gated',
      gaps: ['live writes are not enabled'],
      nextAction: 'Enable execute only after schema and landing checks are ready.',
    }],
  });
  writeJson(path.join(correctionDir, 'lesson_1.json'), {
    lessonId: 'lesson_1',
    status: 'active',
    scope: { surface: 'ad_budget', subject: { sku: 'HAY0218' } },
    doNotApplyWhen: ['same rule has an unresolved correction audit'],
    requiredEvidenceBeforeReuse: ['fresh snapshot', 'same-rule scan'],
    nextValidation: 'confirm same-surface actions read this correction',
  });
  writeJson(path.join(correctionDir, 'lesson_risk_as_inaction.json'), {
    lessonId: 'lesson_risk_as_inaction',
    status: 'active_correction',
    surface: 'agent_operating_behavior',
    scope: { appliesTo: ['agent_operating_behavior', 'risk_as_inaction_excuse'] },
    doNotApplyWhen: ['risk level is the only reason to skip a supported operating action'],
    requiredEvidenceBeforeReuse: ['route supported operating action to evidence, boundary, dry-run, execute, or explicit unsupported gap'],
    nextValidation: {
      dueDate: '2026-05-26',
      checks: ['confirm future supported operating actions route to execute path instead of no-op'],
    },
  });
  writeJson(path.join(skuLessonDir, 'sku_lesson_1.json'), {
    id: 'sku_lesson_1',
    status: 'active',
    lesson: 'Do not widen one variant failure to the full parent without evidence.',
    doNotApplyWhen: ['variant-level evidence is missing'],
    transferableTo: ['same product type and season node only'],
  });

  const memory = buildAgentLearningMemory({
    today: '2026-05-25',
    learningFile,
    autonomyAuditFile,
    correctionDir,
    skuLessonDir,
  }, timeContext);
  assert.strictEqual(memory.status, 'blocked_constraints');
  assert.ok(memory.summary.constraints >= 5);
  assert.strictEqual(memory.summary.corrections, 2);
  assert.strictEqual(memory.summary.skuLessons, 1);
  assert.ok(memory.nextRunBrief.mustReadBeforeDecision.some(file => file.includes('daily_learning_2026-05-25.json')));
  assert.ok(memory.nextRunBrief.doNotApplyWhen.includes('same rule has an unresolved correction audit'));
  assert.ok(memory.nextRunBrief.doNotApplyWhen.includes('risk level is the only reason to skip a supported operating action'));
  assert.ok(memory.nextRunBrief.evidenceBeforeReuse.includes('fresh snapshot'));
  assert.ok(memory.nextRunBrief.evidenceBeforeReuse.includes('route supported operating action to evidence, boundary, dry-run, execute, or explicit unsupported gap'));
  assert.ok(memory.nextRunBrief.openFollowUps.some(item => item.includes('confirm future supported operating actions route to execute path instead of no-op')));
  assert.ok(memory.tasks.some(task => task.kind === 'learning_constraint' && task.priority === 'P0'));
  assert.strictEqual(memory.constraints.find(item => item.id.includes('lesson_risk_as_inaction')).severity, 'warning');
  assert.strictEqual(memory.tasks.find(task => task.title === 'risk level is the only reason to skip a supported operating action').priority, 'P1');
  assert.match(renderAgentLearningMemoryMarkdown(memory), /Agent learning memory/);
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-learning-memory-run-'));
  const learningFile = path.join(tmpDir, 'daily_learning_2026-05-25.json');
  const autonomyAuditFile = path.join(tmpDir, 'autonomy_audit_2026-05-25.json');
  const outFile = path.join(tmpDir, 'learning_memory.json');
  const markdownFile = path.join(tmpDir, 'learning_memory.md');
  writeJson(learningFile, { time: { businessDate: '2026-05-25' }, carryForward: { openQuestions: [] } });
  writeJson(autonomyAuditFile, { checks: [] });
  const memory = runAgentLearningMemory({
    timeContext,
    learningFile,
    autonomyAuditFile,
    correctionDir: path.join(tmpDir, 'missing_corrections'),
    skuLessonDir: path.join(tmpDir, 'missing_sku_lessons'),
    outFile,
    markdownFile,
  });
  assert.ok(fs.existsSync(outFile));
  assert.ok(fs.existsSync(markdownFile));
  assert.strictEqual(JSON.parse(fs.readFileSync(outFile, 'utf8')).files.outFile, outFile);
  assert.strictEqual(memory.files.markdownFile, markdownFile);
}

{
  const parsed = parseNpmRunCommand('npm run ops:agent:learning-memory -- --learning data\\learning\\daily_learning_2026-05-25.json --autonomy-audit data\\agent\\autonomy_audit_2026-05-25.json --today 2026-05-25 --out data\\agent\\learning_memory_2026-05-25.json');
  assert.strictEqual(parsed.ok, true);
  assert.strictEqual(parsed.script, 'ops:agent:learning-memory');
  assert.ok(parsed.args[0].endsWith(path.join('scripts', 'run_agent_learning_memory.js')));
}

console.log('agent_learning_memory tests passed');
