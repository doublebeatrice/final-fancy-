#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const PACK = path.join(ROOT, 'docs', 'AI_ONBOARDING_PACK.md');

// Numbers asserted by docs/AI_ONBOARDING_PACK.md. When the pack is refreshed,
// update these to match. The drift check exists precisely so silent reality
// shifts get flagged.
const EXPECTED = {
  npmScripts: { value: 120, tolerance: 3, section: '§3' },
  codexSkills: { value: 15, tolerance: 0, section: '§4' },
  runAgentScripts: { value: 25, tolerance: 2, section: '§5.1' },
  runTopLevelScripts: { value: 52, tolerance: 4, section: '§5.1' },
  srcTopLevelJs: { value: 80, tolerance: 8, section: '§6' },
  capabilityAdapters: { value: 3, tolerance: 0, section: '§6.1' },
  pipelineStages: { value: 16, tolerance: 0, section: '§6.1' },
  wipDate: '2026-06-19',
};

const REQUIRED_FILES = [
  'auto_adjust.js',
  'CLAUDE.md',
  'AGENTS.md',
  'docs/AI_ONBOARDING_PACK.md',
  'docs/CLAUDE_DIRECTION_PACK.md',
  'docs/AI_DECISION_BOUNDARY.md',
  'docs/AI_DECISION_ENTRY_POINTS.md',
  'docs/CODEX_HANDOFF_RUNBOOK.md',
  'docs/CLAUDE_CROSS_VALIDATION_GUIDE.md',
  'src/pipeline/stage_registry.js',
  'src/capabilities/registry/capabilities.json',
];

function parseArgs(argv) {
  const opts = { json: false, maxWipAgeDays: 30 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--json') opts.json = true;
    else if (argv[i] === '--max-wip-age-days') opts.maxWipAgeDays = Number(argv[++i]);
  }
  return opts;
}

function countNpmScripts(root) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  return Object.keys(pkg.scripts || {}).length;
}

function countDirEntries(dir, predicate) {
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir, { withFileTypes: true }).filter(predicate).length;
}

function countCodexSkills(root) {
  const skills = path.join(root, '.codex', 'skills');
  if (!fs.existsSync(skills)) return 0;
  return fs.readdirSync(skills, { withFileTypes: true })
    .filter(e => e.isDirectory() && fs.existsSync(path.join(skills, e.name, 'SKILL.md')))
    .length;
}

function countRunScripts(root, pattern) {
  const dir = path.join(root, 'scripts');
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).filter(name => pattern.test(name)).length;
}

function countSrcTopLevelJs(root) {
  return countDirEntries(path.join(root, 'src'),
    e => e.isFile() && e.name.endsWith('.js'));
}

function countCapabilityAdapters(root) {
  const dir = path.join(root, 'src', 'capabilities', 'adapters');
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir)
    .filter(name => name.endsWith('.js') && name !== 'index.js' && name !== 'legacy_action_adapter.js')
    .length;
}

function countPipelineStages(root) {
  const file = path.join(root, 'src', 'pipeline', 'stage_registry.js');
  if (!fs.existsSync(file)) return null;
  const src = fs.readFileSync(file, 'utf8');
  const match = src.match(/DEFAULT_STAGES\s*=\s*\[([\s\S]*?)\];/);
  if (!match) return null;
  return (match[1].match(/^\s*['"][a-z_]+['"]/gm) || []).length;
}

function packReferencesOnboarding(root, file) {
  const content = fs.readFileSync(path.join(root, file), 'utf8');
  return content.includes('AI_ONBOARDING_PACK.md');
}

function daysSince(isoDate) {
  const then = Date.parse(isoDate + 'T00:00:00Z');
  if (Number.isNaN(then)) return null;
  return Math.floor((Date.now() - then) / 86400000);
}

function check(name, actual, spec) {
  if (typeof spec.value !== 'number') return null;
  const delta = Math.abs(actual - spec.value);
  if (delta <= spec.tolerance) return null;
  return {
    severity: 'warn',
    id: `drift:${name}`,
    title: `Onboarding pack drift: ${name}`,
    detail: `${spec.section} says ${spec.value} (±${spec.tolerance}), actual is ${actual}.`,
    expected: spec.value,
    actual,
    section: spec.section,
  };
}

function driftCheck(opts) {
  const findings = [];

  const missing = REQUIRED_FILES.filter(f => !fs.existsSync(path.join(ROOT, f)));
  if (missing.length) {
    findings.push({
      severity: 'error',
      id: 'drift:missing-required-files',
      title: 'Files referenced by the onboarding pack are missing',
      detail: missing.join(', '),
      paths: missing,
    });
  }

  const checks = [
    ['npmScripts', countNpmScripts(ROOT)],
    ['codexSkills', countCodexSkills(ROOT)],
    ['runAgentScripts', countRunScripts(ROOT, /^run_agent_.*\.js$/)],
    ['runTopLevelScripts', countRunScripts(ROOT, /^run_.*\.js$/)],
    ['srcTopLevelJs', countSrcTopLevelJs(ROOT)],
    ['capabilityAdapters', countCapabilityAdapters(ROOT)],
    ['pipelineStages', countPipelineStages(ROOT)],
  ];
  for (const [name, actual] of checks) {
    if (actual == null) continue;
    const f = check(name, actual, EXPECTED[name]);
    if (f) findings.push(f);
  }

  for (const file of ['CLAUDE.md', 'AGENTS.md']) {
    if (!packReferencesOnboarding(ROOT, file)) {
      findings.push({
        severity: 'error',
        id: `drift:unwired-${file.toLowerCase()}`,
        title: `${file} no longer references AI_ONBOARDING_PACK.md`,
        detail: 'New Claude/Codex sessions will not be routed to the onboarding pack.',
      });
    }
  }

  const age = daysSince(EXPECTED.wipDate);
  if (age != null && age > opts.maxWipAgeDays) {
    findings.push({
      severity: 'warn',
      id: 'drift:wip-stale',
      title: 'WIP themes section is stale',
      detail: `§11 stamped ${EXPECTED.wipDate}, ${age} days ago (>${opts.maxWipAgeDays}d). Re-run the onboarding workflow or trim §11.`,
      expected: `<= ${opts.maxWipAgeDays} days`,
      actual: `${age} days`,
    });
  }

  return { findings, summary: { drift: findings.length, packPath: path.relative(ROOT, PACK) } };
}

function printHuman(result) {
  if (!result.findings.length) {
    console.log(`OK — onboarding pack (${result.summary.packPath}) matches reality.`);
    return;
  }
  console.log(`Drift: ${result.findings.length} finding(s) against ${result.summary.packPath}`);
  for (const f of result.findings) {
    console.log(`  [${f.severity}] ${f.id}: ${f.title}`);
    console.log(`    ${f.detail}`);
  }
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const result = driftCheck(opts);
  if (opts.json) console.log(JSON.stringify(result, null, 2));
  else printHuman(result);
  process.exit(result.findings.length ? 1 : 0);
}

if (require.main === module) main();

module.exports = { driftCheck, EXPECTED };
