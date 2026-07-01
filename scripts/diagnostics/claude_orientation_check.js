#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const GBRAIN_ROOT = 'D:\\ad-ops-brain';
const GBRAIN_STANDARD_DIR = '04-\u6807\u51c6\u6253\u6cd5';
const GBRAIN_SCRIPT_DIR = '90-\u811a\u672c';
const GBRAIN_RUNNER = path.join(GBRAIN_ROOT, GBRAIN_SCRIPT_DIR, 'run-gbrain.ps1');
const GBRAIN_CLAUDE_RULE = path.join(
  GBRAIN_ROOT,
  GBRAIN_STANDARD_DIR,
  'Claude-Codex\u4ea4\u53c9\u9a8c\u8bc1\u4e0eGBrain\u8c03\u7528.md',
);

const C = {
  ad: '\u5e7f\u544a',
  adAdjust: '\u5e7f\u544a\u8c03\u6574',
  asin: '\u7ade\u54c1ASIN',
  blocked: '\u88ab\u6321',
  canPush: '\u80fd\u4e0d\u80fd\u63a8',
  click: '\u70b9\u51fb',
  conversionLoss: '\u65e0\u8f6c\u5316',
  coverageInsufficient: '\u8986\u76d6\u4e0d\u8db3',
  defaultFilter: '\u9ed8\u8ba4\u7b5b\u9009',
  developerRequest: '\u5f00\u53d1\u8bc9\u6c42',
  effect: '\u6548\u679c',
  evidenceBoundary: '\u8bc1\u636e\u8fb9\u754c',
  exposure: '\u66dd\u5149',
  frontPageNotEffective: '\u524d\u53f0\u672a\u751f\u6548',
  growth: '\u589e\u957f',
  inventory: '\u5e93\u5b58',
  landedQuestion: '\u843d\u5730\u4e86\u5417',
  listing: 'listing',
  listingBoundary: 'listing\u63d0\u4ea4\u8fb9\u754c',
  listingQueryKeepFilters: '\u4ea7\u54c1\u5217\u8868\u67e5\u8be2\u4fdd\u7559\u539f\u59cb\u7b5b\u9009\u9879',
  marketEvidence: '\u5e02\u573a\u8bc1\u636e',
  noClick: '\u65e0\u70b9\u51fb',
  oldSnapshot: '\u65e7\u5feb\u7167',
  productCheck: '\u4ea7\u54c1\u68c0\u67e5',
  productGoal: '\u4ea7\u54c1\u76ee\u6807',
  productListMissing: '\u4ea7\u54c1\u5217\u8868\u67e5\u4e0d\u5230',
  price: '\u4ef7\u683c',
  priceDown: '\u964d\u4ef7',
  priceRaise: '\u63d0\u4ef7',
  queueReview: '\u961f\u5217\u590d\u6838',
  readback: '\u8bfb\u56de',
  recovery: '\u6062\u590d',
  review: '\u590d\u67e5',
  reviewRules: '\u590d\u76d8\u89c4\u5219',
  sellerEmpty: 'seller=\u7a7a',
  selection: '\u9009\u54c1',
  skuDiagnosis: 'SKU\u5b8c\u6574\u8bca\u65ad',
  skuDiagnosisStructure: 'SKU\u5b8c\u6574\u8bca\u65ad\u7ed3\u6784',
  staleSnapshot: '\u65e7\u5feb\u7167',
  submittedPending: 'submitted_pending',
  title: '\u6807\u9898',
  toolRoute: '\u5de5\u5177\u8def\u7531',
  traffic: '\u6d41\u91cf',
  unlanded: '\u672a\u843d\u5730',
  unfilledKeyword: '\u5173\u952e\u8bcd\u672a\u586b',
};

const REQUIRED_READS = [
  'CLAUDE.md',
  'AGENTS.md',
  'README.md',
  'docs/CLAUDE_DIRECTION_PACK.md',
  'docs/CLAUDE_CROSS_VALIDATION_GUIDE.md',
  'docs/PRODUCT_MARKET_EVIDENCE_STACK.md',
  GBRAIN_CLAUDE_RULE,
];

const UPDATE_MODEL = [
  'package.json scripts',
  'required doc path existence',
  'GBrain doctor status',
  'task-derived GBrain search terms',
  'orientation cases JSON',
];

function parseArgs(argv) {
  const args = { actor: 'claude', task: '', json: false, skipGbrainDoctor: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') {
      args.json = true;
      continue;
    }
    if (arg === '--skip-gbrain-doctor') {
      args.skipGbrainDoctor = true;
      continue;
    }
    if (arg === '--actor') {
      args.actor = argv[i + 1] || args.actor;
      i += 1;
      continue;
    }
    if (arg === '--task') {
      args.task = argv[i + 1] || '';
      i += 1;
    }
  }
  return args;
}

function readPackageScripts(root = ROOT) {
  return JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).scripts || {};
}

function normalizePathForSet(filePath) {
  return filePath.replace(/\//g, '\\');
}

function pathExists(filePath, options = {}) {
  if (options.existingPaths) {
    return options.existingPaths.has(filePath) || options.existingPaths.has(normalizePathForSet(filePath));
  }
  if (path.isAbsolute(filePath)) return fs.existsSync(filePath);
  return fs.existsSync(path.join(ROOT, filePath));
}

function unique(items) {
  return Array.from(new Set(items.filter(Boolean)));
}

function hasAny(text, needles) {
  return needles.some(needle => text.includes(needle));
}

function extractObjectTerms(task) {
  const skuMatches = task.match(/\b[A-Z]{2,5}\d{3,5}\b/g) || [];
  const asinMatches = task.match(/\bB0[A-Z0-9]{8}\b/g) || [];
  return unique([...skuMatches, ...asinMatches]);
}

function deriveWorkflowTerms(task) {
  const terms = [];
  if (hasAny(task, [C.ad, 'bid', 'budget', 'campaign', C.traffic, C.exposure, C.click])) {
    terms.push(C.adAdjust, C.skuDiagnosis, C.productGoal, C.marketEvidence);
  }
  if (hasAny(task, [C.listing, C.title, C.unfilledKeyword, '\u6587\u6848', 'search term', '\u4e94\u70b9'])) {
    terms.push(C.listingBoundary, 'new-product-listing-writing', C.listingQueryKeepFilters);
  }
  if (hasAny(task, [C.price, C.priceRaise, C.priceDown])) {
    terms.push(C.price, '\u63d0\u4ef7\u540e\u7684\u5e7f\u544a\u8054\u52a8');
  }
  if (hasAny(task, [C.inventory, '\u6e05\u4ed3', '\u8865\u8d27', '\u6ede\u9500'])) {
    terms.push(C.inventory, '\u6ede\u9500', '\u5e93\u5b58\u8854\u63a5');
  }
  if (hasAny(task, [C.developerRequest, '\u4ea7\u54c1\u8bc9\u6c42', C.canPush, '\u65b0\u54c1'])) {
    terms.push(C.developerRequest, C.productCheck, C.selection);
  }
  if (hasAny(task, [C.review, C.effect, '\u8fc7\u4e86\u5417', C.landedQuestion])) {
    terms.push(C.reviewRules, C.toolRoute);
  }
  if (terms.length === 0) terms.push(C.toolRoute, C.evidenceBoundary, C.skuDiagnosisStructure);
  return unique(terms);
}

function deriveFailureModeTerms(task) {
  const terms = [C.unlanded, C.readback, C.oldSnapshot, C.defaultFilter];
  if (hasAny(task, ['push', C.growth, C.recovery, '\u4e0b\u6ed1', '\u8986\u76d6', C.exposure, C.click])) {
    terms.push(C.coverageInsufficient, C.noClick, C.conversionLoss);
  }
  if (hasAny(task, [C.listing, C.unfilledKeyword, '\u4ea7\u54c1\u5217\u8868'])) {
    terms.push(C.productListMissing, C.sellerEmpty, C.queueReview);
  }
  if (hasAny(task, [C.price, C.priceRaise])) {
    terms.push(C.submittedPending, C.frontPageNotEffective);
  }
  return unique(terms);
}

function deriveSystemRouteTerms(task) {
  const terms = [];
  if (hasAny(task, [C.ad, 'bid', 'budget', 'campaign', C.traffic, C.exposure, C.click])) {
    terms.push('adv', '/product/adSkuSummary', '/product/adProductData', '/keyword/findAllNew');
  }
  if (hasAny(task, [C.listing, C.unfilledKeyword, '\u4ea7\u54c1\u5217\u8868', 'sellerinventory', C.inventory, C.price])) {
    terms.push('sellerinventory', '/pm/list', '/pm/formal/list');
  }
  if (hasAny(task, [C.selection, '\u5e02\u573a', '\u5173\u952e\u8bcd', C.asin, C.canPush])) {
    terms.push('selection', 'SIF', 'Product Time Machine');
  }
  if (terms.length === 0) terms.push('adv', 'sellerinventory', 'selection');
  return unique(terms);
}

function deriveSearchAngles(task) {
  return {
    objectTerms: extractObjectTerms(task),
    workflowTerms: deriveWorkflowTerms(task),
    failureModeTerms: deriveFailureModeTerms(task),
    systemRouteTerms: deriveSystemRouteTerms(task),
  };
}

function runGbrainDoctor() {
  if (!fs.existsSync(GBRAIN_RUNNER)) return { status: 'unavailable', error: `missing ${GBRAIN_RUNNER}` };
  const result = spawnSync('powershell', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    GBRAIN_RUNNER,
    'doctor',
    '--json',
  ], { cwd: ROOT, encoding: 'utf8', timeout: 60000 });

  const output = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
  const jsonStart = output.indexOf('{');
  if (jsonStart === -1) return { status: 'unavailable', exitCode: result.status, error: output.slice(0, 1000) };
  const jsonEnd = output.indexOf('\n[', jsonStart);
  const jsonText = jsonEnd === -1 ? output.slice(jsonStart) : output.slice(jsonStart, jsonEnd);
  try {
    return JSON.parse(jsonText);
  } catch (err) {
    return { status: 'unavailable', exitCode: result.status, error: err.message };
  }
}

function summarizeGbrainDoctor(doctor) {
  const checks = Array.isArray(doctor && doctor.checks) ? doctor.checks : [];
  const connection = checks.find(check => check.name === 'connection');
  const syncFreshness = checks.find(check => check.name === 'sync_freshness');
  const indexedSearchUsable = Boolean(connection && connection.status === 'ok');
  const rawSearchRequired = !indexedSearchUsable || Boolean(syncFreshness && syncFreshness.status !== 'ok');
  return {
    status: doctor ? doctor.status || 'unknown' : 'unknown',
    indexedSearchUsable,
    rawSearchRequired,
    connection: connection ? { status: connection.status, message: connection.message } : null,
    syncFreshness: syncFreshness ? { status: syncFreshness.status, message: syncFreshness.message } : null,
  };
}

function existingRequiredReads(options = {}) {
  return REQUIRED_READS.map(filePath => ({ path: filePath, exists: pathExists(filePath, options) }));
}

function recommendedCommandsFor(packageScripts, searchAngles) {
  const commands = [];
  const addScript = (name, suffix = '') => {
    if (packageScripts[name]) commands.push(`npm run ${name}${suffix}`);
  };
  addScript('chrome:operator');
  addScript('chrome:ready');
  addScript('ops:today', ' -- --mode full-snapshot --actor claude');
  addScript('ops:deposit:status', ' -- --date <YYYY-MM-DD> --json');
  if (searchAngles.workflowTerms.some(term => hasAny(term, [C.ad, '\u5e02\u573a', '\u4ea7\u54c1', C.selection, 'SKU']))) {
    addScript('ops:selection:keyword-research', ' -- --sku <SKU> --terms "<term1, term2>"');
    addScript('ops:selection:keyword-conversion', ' -- --keywords "<term1, term2>"');
    addScript('ops:selection:aba-search-terms', ' -- --search-terms "<term1, term2>"');
  }
  if (searchAngles.systemRouteTerms.includes('SIF')) {
    addScript('ops:sif:reverse-keywords', ' -- --asin <ASIN>');
    addScript('ops:sif:keyword-history', ' -- --keyword "<term>"');
  }
  addScript('ops:agent:inbox', ' -- --text "<external request>"');
  return unique(commands);
}

function buildOrientationReport(options = {}) {
  const actor = options.actor || 'claude';
  const task = options.task || '';
  const packageScripts = options.packageScripts || readPackageScripts();
  const searchAngles = deriveSearchAngles(task);
  return {
    actor,
    task,
    updateModel: {
      dynamicInputs: UPDATE_MODEL,
      manualInputs: ['new real failure cases', 'durable GBrain lessons', 'workflow docs when process changes'],
      casesPath: 'data/evals/agent_orientation_cases.json',
    },
    requiredReads: existingRequiredReads({ existingPaths: options.existingPaths }),
    gbrain: {
      ...summarizeGbrainDoctor(options.gbrainDoctor || null),
      searchAngles,
    },
    recommendedCommands: recommendedCommandsFor(packageScripts, searchAngles),
    completionContract: [
      'state GBrain keywords searched',
      'state whether prior conclusions were found',
      'state evidence boundary: live, local snapshot, GBrain, or mixed',
      'name missing live reads when current state matters',
      'do not call API success landed success without readback',
    ],
  };
}

function formatMarkdown(report) {
  const lines = [];
  lines.push('# Claude Orientation Brief', '');
  lines.push(`Actor: ${report.actor}`);
  lines.push(`Task: ${report.task || '(not provided)'}`, '');
  lines.push('## Does This Update?', '');
  lines.push('Yes. The check reads dynamic inputs on every run:');
  for (const item of report.updateModel.dynamicInputs) lines.push(`- ${item}`);
  lines.push('', 'Manual updates still matter for new real failure cases and durable GBrain lessons.', '');
  lines.push('## Required Reads');
  for (const item of report.requiredReads) lines.push(`- ${item.exists ? 'ok' : 'missing'}: ${item.path}`);
  lines.push('', '## GBrain');
  lines.push(`- status: ${report.gbrain.status}`);
  lines.push(`- indexed search usable: ${report.gbrain.indexedSearchUsable}`);
  lines.push(`- raw search required: ${report.gbrain.rawSearchRequired}`);
  if (report.gbrain.syncFreshness) {
    lines.push(`- sync freshness: ${report.gbrain.syncFreshness.status} - ${report.gbrain.syncFreshness.message}`);
  }
  lines.push('', 'Search angles:');
  for (const [name, terms] of Object.entries(report.gbrain.searchAngles)) {
    lines.push(`- ${name}: ${terms.join(', ') || '(none)'}`);
  }
  lines.push('', '## Recommended Commands');
  for (const command of report.recommendedCommands) lines.push(`- \`${command}\``);
  lines.push('', '## Completion Contract');
  for (const item of report.completionContract) lines.push(`- ${item}`);
  return `${lines.join('\n')}\n`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = buildOrientationReport({
    actor: args.actor,
    task: args.task,
    gbrainDoctor: args.skipGbrainDoctor ? null : runGbrainDoctor(),
  });
  process.stdout.write(args.json ? `${JSON.stringify(report, null, 2)}\n` : formatMarkdown(report));
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    process.stderr.write(`${err.stack || err.message}\n`);
    process.exit(1);
  }
}

module.exports = {
  buildOrientationReport,
  deriveSearchAngles,
  parseArgs,
  readPackageScripts,
  runGbrainDoctor,
  summarizeGbrainDoctor,
};
