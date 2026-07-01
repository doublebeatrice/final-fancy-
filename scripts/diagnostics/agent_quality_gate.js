#!/usr/bin/env node
'use strict';

const {
  buildOrientationReport,
  parseArgs: parseOrientationArgs,
  readPackageScripts,
  runGbrainDoctor,
} = require('./claude_orientation_check');

const TEXT = {
  acceptance: '3/7\u5929\u9a8c\u6536',
  ad: '\u5e7f\u544a',
  current: '\u4eca\u5929',
  evidenceBoundary: '\u8bc1\u636e\u8fb9\u754c',
  gbrainObjectMissing: 'GBrain \u641c\u7d22\u7f3a\u5bf9\u8c61\u8bcd\uff1a\u9700\u8865 SKU/ASIN/campaign/keyword/product line',
  liveRead: 'live read',
  market: '\u4ea7\u54c1/\u5e02\u573a',
  objectTerm: '\u5bf9\u8c61\u8bcd',
  productMarketFirst: '\u4ea7\u54c1/\u5e02\u573a\u5148\u4e8e\u5e7f\u544a\u52a8\u4f5c',
  profit: '\u5229\u6da6/\u9500\u91cf\u8d28\u91cf/\u5e93\u5b58\u5065\u5eb7',
  rawGbrain: 'raw GBrain file search required because indexed freshness is stale or unavailable',
  readback: '\u8bfb\u56de/readback',
  routeMissing: '\u4efb\u52a1\u8def\u7531\u4e0d\u591f\u660e\u786e',
  shortestPath: '\u6700\u77ed\u6709\u6548\u8def\u5f84',
};

function parseArgs(argv) {
  return parseOrientationArgs(argv);
}

function hasAny(items, predicates) {
  return items.some(item => predicates.some(predicate => predicate(item)));
}

function inferRoutes(task, searchAngles) {
  const routes = [];
  const systems = searchAngles.systemRouteTerms || [];
  const workflows = searchAngles.workflowTerms || [];
  const text = task || '';

  if (systems.includes('adv') || hasAny(workflows, [item => item.includes(TEXT.ad)])) routes.push('advertising');
  if (systems.includes('sellerinventory') || /sellerinventory|listing|\u5173\u952e\u8bcd\u672a\u586b/.test(text)) {
    routes.push('sellerinventory');
  }
  if (systems.includes('selection') || systems.includes('SIF')) routes.push('selection');
  if (/deposit|\u6c89\u6dc0|\u65e5\u62a5/.test(text)) routes.push('deposit');
  if (/\u5f00\u53d1|\u8bc9\u6c42|developer/.test(text)) routes.push('developer-request');
  if (/\u590d\u67e5|\u6548\u679c|review|Codex|Claude/.test(text)) routes.push('cross-review');

  return Array.from(new Set(routes));
}

function scoreTaskRouting(routes, orientation) {
  let score = 0;
  const findings = [];
  if (routes.length > 0) score += 10;
  else findings.push(TEXT.routeMissing);
  if (routes.length > 1) score += 4;
  else if (routes.length === 1) score += 3;
  if (orientation.requiredReads.every(item => item.exists)) score += 4;
  else findings.push('required docs missing');
  if ((orientation.gbrain.searchAngles.objectTerms || []).length > 0) score += 2;
  else findings.push(TEXT.gbrainObjectMissing);
  if ((orientation.gbrain.searchAngles.objectTerms || []).length === 0) score = Math.min(score, 14);
  return { score: Math.min(score, 20), findings };
}

function scoreGbrainSearchQuality(searchAngles) {
  const findings = [];
  let score = 0;
  if ((searchAngles.objectTerms || []).length > 0) score += 5;
  else findings.push(TEXT.gbrainObjectMissing);
  if ((searchAngles.workflowTerms || []).length > 0) score += 5;
  else findings.push('GBrain search missing workflow terms');
  if ((searchAngles.failureModeTerms || []).length >= 3) score += 5;
  else findings.push('GBrain search missing failure-mode terms');
  if ((searchAngles.systemRouteTerms || []).length > 0) score += 5;
  else findings.push('GBrain search missing system/route terms');
  return { score, findings };
}

function taskRequiresLiveRead(task) {
  return /\u4eca\u5929|\u73b0\u5728|\u5f53\u524d|latest|current|now|\u7ee7\u7eed|\u80fd\u4e0d\u80fd/.test(task || '');
}

function scoreEvidenceBoundary(orientation, task) {
  const findings = [];
  const requirements = [];
  let score = 0;

  if (orientation.completionContract.some(item => item.includes('evidence boundary'))) score += 6;
  else findings.push('completion contract missing evidence boundary');

  if (taskRequiresLiveRead(task)) {
    requirements.push(`${TEXT.liveRead}: current state must be verified live before action`);
    score += 5;
  } else {
    score += 5;
  }

  if (orientation.gbrain.indexedSearchUsable) score += 4;
  else findings.push('GBrain indexed search is not usable');

  if (orientation.gbrain.rawSearchRequired) {
    requirements.push('raw GBrain search: `rg -n "<keyword>" D:\\ad-ops-brain`');
    score += 3;
  } else {
    score += 3;
  }

  if (orientation.completionContract.some(item => item.includes('readback'))) score += 2;
  else findings.push('readback boundary missing');

  return { score: Math.min(score, 20), findings, requirements };
}

function commandExists(packageScripts, name) {
  return Boolean(packageScripts && packageScripts[name]);
}

function scoreRuntimeEfficiency(orientation, routes, packageScripts) {
  const findings = [];
  const requirements = [];
  let score = 0;
  const commandCount = orientation.recommendedCommands.length;

  if (commandCount > 0 && commandCount <= 10) score += 5;
  else findings.push('recommended command set is too broad or empty');

  if (commandExists(packageScripts, 'ops:agent:orientation')) score += 4;
  else findings.push('orientation command is not registered');

  if (!routes.includes('advertising') || commandExists(packageScripts, 'ops:selection:keyword-research')) score += 4;
  else findings.push('advertising route lacks market evidence command');

  if (!routes.includes('advertising') || (commandExists(packageScripts, 'chrome:operator') && commandExists(packageScripts, 'chrome:ready'))) {
    score += 4;
  } else {
    findings.push('advertising route lacks shared Chrome readiness commands');
  }

  if (orientation.gbrain.rawSearchRequired) {
    requirements.push(TEXT.rawGbrain);
    score += 1;
  } else {
    score += 3;
  }

  return { score: Math.min(score, 20), findings, requirements };
}

function scoreOperatingOutputQuality(routes, task) {
  const findings = [];
  const requirements = [TEXT.profit];
  let score = 5;

  if (routes.includes('advertising') || /\u80fd\u4e0d\u80fd\u63a8|\u589e\u957f|\u4e0b\u6ed1/.test(task || '')) {
    requirements.push(TEXT.productMarketFirst);
    score += 5;
  } else {
    score += 4;
  }

  requirements.push(TEXT.readback);
  score += 4;

  requirements.push(TEXT.acceptance);
  score += 3;

  requirements.push('operator-ready conclusion with risk and next verification');
  score += 3;

  if (!routes.includes('advertising') && !routes.includes('selection') && !routes.includes('sellerinventory')) {
    findings.push('business route may need sharper operating context');
    score -= 1;
  }

  return { score: Math.max(0, Math.min(score, 20)), findings, requirements };
}

function statusFor(totalScore, warnings) {
  if (totalScore >= 90 && warnings.length === 0) return 'pass';
  if (totalScore >= 75) return 'pass_with_warnings';
  if (totalScore >= 50) return 'needs_evidence';
  return 'blocked';
}

function firstOrPlaceholder(items, placeholder) {
  return items && items.length > 0 ? items[0] : placeholder;
}

function buildNextShortestPath(orientation, routes) {
  const angles = orientation.gbrain.searchAngles;
  const objectTerm = firstOrPlaceholder(angles.objectTerms, '<SKU-or-ASIN>');
  const workflowTerm = firstOrPlaceholder(angles.workflowTerms, '<workflow-term>');
  const failureTerm = firstOrPlaceholder(angles.failureModeTerms, '<failure-mode-term>');
  const routeTerm = firstOrPlaceholder(angles.systemRouteTerms, '<system-route-term>');
  const path = [
    `npm run ops:agent:orientation -- --actor ${orientation.actor} --task "${orientation.task || '<task>'}"`,
    `D:\\ad-ops-brain\\90-\u811a\u672c\\run-gbrain.ps1 search "${objectTerm}"`,
    `D:\\ad-ops-brain\\90-\u811a\u672c\\run-gbrain.ps1 search "${workflowTerm}"`,
    `D:\\ad-ops-brain\\90-\u811a\u672c\\run-gbrain.ps1 search "${failureTerm}"`,
    `D:\\ad-ops-brain\\90-\u811a\u672c\\run-gbrain.ps1 search "${routeTerm}"`,
  ];

  if (orientation.gbrain.rawSearchRequired) {
    path.push(`rg -n "${objectTerm}" D:\\ad-ops-brain`);
  }
  if (routes.includes('advertising')) {
    path.push('npm run chrome:operator');
    path.push('npm run chrome:ready');
    path.push('npm run ops:selection:keyword-research -- --sku <SKU> --terms "<term1, term2>"');
  }
  if (routes.includes('selection')) {
    path.push('npm run ops:sif:reverse-keywords -- --asin <ASIN>');
  }
  path.push('Only after evidence is sufficient: produce decision, action scope, readback path, and 3/7-day checkpoint.');
  return path;
}

function collectQualityRequirements(...dimensionResults) {
  return Array.from(new Set(dimensionResults.flatMap(result => result.requirements || [])));
}

function buildQualityGateReport(options = {}) {
  const packageScripts = options.packageScripts || readPackageScripts();
  const orientation = options.orientationReport || buildOrientationReport({
    actor: options.actor || 'claude',
    task: options.task || '',
    packageScripts,
    existingPaths: options.existingPaths,
    gbrainDoctor: options.gbrainDoctor || null,
  });
  const routes = inferRoutes(orientation.task, orientation.gbrain.searchAngles);

  const taskRouting = scoreTaskRouting(routes, orientation);
  const gbrainSearchQuality = scoreGbrainSearchQuality(orientation.gbrain.searchAngles);
  const evidenceBoundaryQuality = scoreEvidenceBoundary(orientation, orientation.task);
  const runtimeEfficiency = scoreRuntimeEfficiency(orientation, routes, packageScripts);
  const operatingOutputQuality = scoreOperatingOutputQuality(routes, orientation.task);

  const dimensions = {
    taskRouting: { label: '\u4efb\u52a1\u8def\u7531', ...taskRouting },
    gbrainSearchQuality: { label: 'GBrain \u641c\u7d22\u8d28\u91cf', ...gbrainSearchQuality },
    evidenceBoundaryQuality: { label: '\u8bc1\u636e\u8fb9\u754c\u8d28\u91cf', ...evidenceBoundaryQuality },
    runtimeEfficiency: { label: '\u8fd0\u884c\u6548\u7387', ...runtimeEfficiency },
    operatingOutputQuality: { label: '\u8fd0\u8425\u8f93\u51fa\u8d28\u91cf', ...operatingOutputQuality },
  };
  const totalScore = Object.values(dimensions).reduce((sum, item) => sum + item.score, 0);
  const weakPoints = Array.from(new Set(Object.values(dimensions).flatMap(item => item.findings || [])));
  const warnings = [];
  if (orientation.gbrain.rawSearchRequired) warnings.push(TEXT.rawGbrain);
  if (orientation.gbrain.status && orientation.gbrain.status !== 'ok' && orientation.gbrain.status !== 'unknown') {
    warnings.push(`GBrain doctor status: ${orientation.gbrain.status}`);
  }

  return {
    actor: orientation.actor,
    task: orientation.task,
    status: statusFor(totalScore, warnings),
    totalScore,
    maxScore: 100,
    routes,
    dimensions,
    weakPoints,
    warnings,
    qualityRequirements: collectQualityRequirements(
      evidenceBoundaryQuality,
      runtimeEfficiency,
      operatingOutputQuality,
    ),
    nextShortestPath: buildNextShortestPath(orientation, routes),
    orientation,
  };
}

function formatMarkdown(report) {
  const lines = [];
  lines.push('# Agent Quality Gate', '');
  lines.push(`Actor: ${report.actor}`);
  lines.push(`Task: ${report.task || '(not provided)'}`);
  lines.push(`Score: ${report.totalScore} / ${report.maxScore}`);
  lines.push(`Status: ${report.status}`);
  lines.push(`Routes: ${report.routes.join(', ') || '(unknown)'}`, '');
  lines.push('## Dimensions');
  for (const item of Object.values(report.dimensions)) {
    lines.push(`- ${item.label}: ${item.score} / 20`);
  }
  if (report.weakPoints.length > 0) {
    lines.push('', '## Weak Points');
    for (const item of report.weakPoints) lines.push(`- ${item}`);
  }
  if (report.warnings.length > 0) {
    lines.push('', '## Warnings');
    for (const item of report.warnings) lines.push(`- ${item}`);
  }
  lines.push('', '## Quality Requirements');
  for (const item of report.qualityRequirements) lines.push(`- ${item}`);
  lines.push('', '## Next Shortest Path');
  report.nextShortestPath.forEach((step, index) => lines.push(`${index + 1}. ${step}`));
  return `${lines.join('\n')}\n`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const gbrainDoctor = args.skipGbrainDoctor ? null : runGbrainDoctor();
  const report = buildQualityGateReport({
    actor: args.actor,
    task: args.task,
    gbrainDoctor,
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
  buildQualityGateReport,
  inferRoutes,
  parseArgs,
  statusFor,
};
