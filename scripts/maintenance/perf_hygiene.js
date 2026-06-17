#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_ARCHIVE_ROOT = path.resolve(ROOT, '..', 'ad-ops-workbench-archive');
const RUNTIME_DIRS = [
  path.join(ROOT, 'data', 'snapshots'),
  path.join(ROOT, 'data', 'attribution'),
];
const REPORT_DIRS = [
  path.join(ROOT, 'data', 'snapshots'),
  path.join(ROOT, 'data', 'attribution'),
  path.join(ROOT, 'data', 'tasks'),
  path.join(ROOT, 'data', 'learning'),
  path.join(ROOT, 'discovery', 'output'),
  path.join(ROOT, 'outputs'),
  path.join(ROOT, '.git'),
];
const KEEP_BASENAMES = new Set([
  'latest_snapshot.json',
  'latest_snapshot_profiled.json',
]);
const DEFAULT_HYGIENE_THRESHOLDS = {
  snapshotBytes: 5 * 1024 * 1024 * 1024,
  maxPackageScripts: 115,
  maxDateStampedExecuteScripts: 25,
  maxRootArtifacts: 0,
  maxLargeFiles: 20,
  largeFileBytes: 50 * 1024 * 1024,
  maxUntrackedFiles: 284,
  maxReviewNeededUntrackedFiles: 0,
  maxSourceWithoutTests: 12,
  maxOrphanSourceTests: 2,
};
const SUSPICIOUS_ROOT_BASENAMES = new Set([
  '--json',
  '7',
  '30',
  '2026-06-12',
]);
const LARGE_FILE_IGNORED_PREFIXES = [
  '.git/',
  'node_modules/',
  'tools/chrome-for-testing/',
  'data/snapshots/',
  'data/attribution/',
];

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      args._.push(arg);
      continue;
    }
    const key = arg.slice(2);
    if (key === 'execute' || key === 'json') {
      args[key] = true;
      continue;
    }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = Number(bytes || 0);
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 2)} ${units[unit]}`;
}

function rel(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/');
}

function relFrom(root, file) {
  return path.relative(root, file).replace(/\\/g, '/');
}

function ignoreMissingFile(err) {
  return err && err.code === 'ENOENT';
}

function safeStat(file) {
  try {
    return fs.statSync(file);
  } catch (err) {
    if (ignoreMissingFile(err)) return null;
    throw err;
  }
}

function walkFiles(dir) {
  const files = [];
  if (!fs.existsSync(dir)) return files;
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (err) {
      if (ignoreMissingFile(err)) continue;
      throw err;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile()) {
        files.push(full);
      }
    }
  }
  return files;
}

function dirStats(dir) {
  const files = walkFiles(dir);
  let bytes = 0;
  let newest = 0;
  let oldest = Number.MAX_SAFE_INTEGER;
  for (const file of files) {
    const stat = safeStat(file);
    if (!stat) continue;
    bytes += stat.size;
    newest = Math.max(newest, stat.mtimeMs);
    oldest = Math.min(oldest, stat.mtimeMs);
  }
  return {
    path: rel(dir),
    files: files.length,
    bytes,
    size: formatBytes(bytes),
    newest: newest ? new Date(newest).toISOString() : null,
    oldest: oldest === Number.MAX_SAFE_INTEGER ? null : new Date(oldest).toISOString(),
  };
}

function dirStatsForRoot(root, dir) {
  const files = walkFiles(dir);
  let bytes = 0;
  for (const file of files) {
    const stat = safeStat(file);
    if (stat) bytes += stat.size;
  }
  return {
    path: relFrom(root, dir),
    files: files.length,
    bytes,
    size: formatBytes(bytes),
  };
}

function git(args, options = {}) {
  return execFileSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: options.stdio || ['ignore', 'pipe', 'pipe'],
  });
}

function timedGitStatus() {
  const start = Date.now();
  const output = git(['status', '--short']);
  const ms = Date.now() - start;
  const lines = output.split(/\r?\n/).filter(Boolean);
  return {
    ms,
    changed: lines.length,
    untracked: lines.filter(line => line.startsWith('?? ')).length,
  };
}

function listMcpProcesses() {
  if (process.platform !== 'win32') {
    return [];
  }
  const script = [
    "$items = Get-CimInstance Win32_Process | Where-Object {",
    "  ($_.Name -in @('node.exe','cmd.exe')) -and ($_.CommandLine -like '*chrome-devtools-mcp*')",
    '} | Select-Object ProcessId,ParentProcessId,Name,WorkingSetSize,CommandLine',
    'if ($items) { $items | ConvertTo-Json -Depth 3 }',
  ].join('\n');
  const output = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  if (!output) return [];
  const parsed = JSON.parse(output);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function stopMcpProcesses() {
  if (process.platform !== 'win32') {
    throw new Error('stop-mcp currently supports Windows PowerShell only.');
  }
  const before = listMcpProcesses();
  if (!before.length) {
    return { stopped: 0, remaining: 0, before };
  }
  const ids = before.map(item => Number(item.ProcessId)).filter(Boolean);
  const script = [
    `$ids = @(${ids.join(',')})`,
    'if ($ids.Count -gt 0) { Stop-Process -Id $ids -Force }',
    'Start-Sleep -Milliseconds 500',
  ].join('\n');
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return { stopped: ids.length, remaining: listMcpProcesses().length, before };
}

function assertRuntimeDirsUntracked() {
  const tracked = git(['ls-files', '--', ...RUNTIME_DIRS.map(dir => rel(dir))])
    .split(/\r?\n/)
    .filter(Boolean);
  if (tracked.length) {
    throw new Error(`Refusing to archive tracked runtime files: ${tracked.slice(0, 10).join(', ')}`);
  }
}

function shouldArchive(file, cutoffMs) {
  const stat = safeStat(file);
  if (!stat) return false;
  const base = path.basename(file);
  if (KEEP_BASENAMES.has(base)) return false;
  return stat.mtimeMs < cutoffMs;
}

function ensureInside(parent, target) {
  const relative = path.relative(parent, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Path escaped expected root: ${target}`);
  }
}

function moveFile(source, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  try {
    fs.renameSync(source, dest);
  } catch (err) {
    if (err && err.code === 'EXDEV') {
      fs.copyFileSync(source, dest);
      fs.unlinkSync(source);
      return;
    }
    throw err;
  }
}

function removeEmptyDirs(dir) {
  if (!fs.existsSync(dir)) return 0;
  let removed = 0;
  const dirs = [];
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const full = path.join(current, entry.name);
        dirs.push(full);
        stack.push(full);
      }
    }
  }
  dirs.sort((a, b) => b.length - a.length);
  for (const current of dirs) {
    try {
      fs.rmdirSync(current);
      removed += 1;
    } catch (_) {
      // Non-empty directories stay in place.
    }
  }
  return removed;
}

function archiveRuntime(args) {
  assertRuntimeDirsUntracked();
  const keepDays = Number(args['keep-days'] || 3);
  if (!Number.isFinite(keepDays) || keepDays < 0) {
    throw new Error('--keep-days must be a non-negative number');
  }
  const archiveRoot = path.resolve(args['archive-root'] || DEFAULT_ARCHIVE_ROOT);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const archiveDir = path.join(archiveRoot, stamp);
  const cutoffMs = Date.now() - keepDays * 24 * 60 * 60 * 1000;
  const candidates = [];
  for (const dir of RUNTIME_DIRS) {
    ensureInside(ROOT, dir);
    for (const file of walkFiles(dir)) {
      if (shouldArchive(file, cutoffMs)) {
        const stat = safeStat(file);
        if (!stat) continue;
        candidates.push({
          source: file,
          dest: path.join(archiveDir, rel(file)),
          bytes: stat.size,
          mtime: new Date(stat.mtimeMs).toISOString(),
        });
      }
    }
  }
  candidates.sort((a, b) => b.bytes - a.bytes);
  const totalBytes = candidates.reduce((sum, item) => sum + item.bytes, 0);
  const summary = {
    execute: Boolean(args.execute),
    keepDays,
    archiveDir,
    files: candidates.length,
    bytes: totalBytes,
    size: formatBytes(totalBytes),
    topFiles: candidates.slice(0, 20).map(item => ({
      path: rel(item.source),
      size: formatBytes(item.bytes),
      mtime: item.mtime,
    })),
  };
  if (!args.execute) {
    return summary;
  }
  for (const item of candidates) {
    moveFile(item.source, item.dest);
  }
  const removedDirs = RUNTIME_DIRS.reduce((sum, dir) => sum + removeEmptyDirs(dir), 0);
  const manifest = {
    createdAt: new Date().toISOString(),
    root: ROOT,
    keepDays,
    files: candidates.map(item => ({
      source: rel(item.source),
      archivedTo: path.relative(archiveRoot, item.dest).replace(/\\/g, '/'),
      bytes: item.bytes,
      mtime: item.mtime,
    })),
  };
  fs.mkdirSync(archiveDir, { recursive: true });
  fs.writeFileSync(path.join(archiveDir, 'archive_manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  return { ...summary, removedEmptyDirs: removedDirs };
}

function largestFiles(limit = 15) {
  return walkFiles(path.join(ROOT, 'data'))
    .map(file => {
      const stat = safeStat(file);
      if (!stat) return null;
      return { path: rel(file), bytes: stat.size, size: formatBytes(stat.size), mtime: stat.mtime.toISOString() };
    })
    .filter(Boolean)
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, limit);
}

function findLargeFiles(root, limit, minBytes) {
  return walkFiles(root)
    .filter(file => {
      const relative = relFrom(root, file);
      return !LARGE_FILE_IGNORED_PREFIXES.some(prefix => relative.startsWith(prefix));
    })
    .map(file => {
      const stat = safeStat(file);
      if (!stat) return null;
      return { path: relFrom(root, file), bytes: stat.size, size: formatBytes(stat.size) };
    })
    .filter(Boolean)
    .filter(item => item.bytes >= minBytes)
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, limit);
}

function readPackageScriptCount(root) {
  const packagePath = path.join(root, 'package.json');
  if (!fs.existsSync(packagePath)) return 0;
  const parsed = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  return Object.keys(parsed.scripts || {}).length;
}

function listUntrackedFiles(root) {
  try {
    return execFileSync('git', ['ls-files', '--others', '--exclude-standard'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).split(/\r?\n/).filter(Boolean).map(file => file.replace(/\\/g, '/'));
  } catch (_) {
    return [];
  }
}

function listTrackedFiles(root) {
  try {
    return execFileSync('git', ['ls-files'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).split(/\r?\n/).filter(Boolean).map(file => file.replace(/\\/g, '/'));
  } catch (_) {
    return [];
  }
}

function classifyUntrackedFile(file) {
  const normalized = file.replace(/\\/g, '/');
  if (normalized.startsWith('data/actions/')) return 'business-evidence';
  if (normalized.startsWith('data/learning/')) return 'business-memory';
  if (normalized.startsWith('data/adjustments/')) return 'business-memory';
  if (normalized.startsWith('data/schema/')) return 'business-schema';
  if (normalized.startsWith('data/selection/')) return 'business-evidence';
  if (normalized.startsWith('src/') || normalized.startsWith('tests/') || normalized.startsWith('scripts/')) return 'source-or-test';
  if (normalized.startsWith('docs/') || normalized.startsWith('config/')) return 'config-or-doc';
  return 'review-needed';
}

function untrackedReport(options = {}) {
  const root = path.resolve(options.root || ROOT);
  const files = Array.isArray(options.files) ? options.files : listUntrackedFiles(root);
  const groups = new Map();
  for (const file of files) {
    const category = classifyUntrackedFile(file);
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(file);
  }
  const categories = Array.from(groups.entries())
    .map(([category, paths]) => ({
      category,
      count: paths.length,
      paths: paths.slice(0, 40),
    }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
  return {
    root,
    total: files.length,
    categories,
  };
}

function unique(items) {
  return Array.from(new Set(items));
}

function testCandidatesForSource(file) {
  const base = path.basename(file, '.js');
  const names = [base];
  if (base.startsWith('run_')) {
    const stripped = base.replace(/^run_/, '');
    names.push(stripped, `${stripped}_cli`);
  }
  if (base.startsWith('generate_')) {
    names.push(base.replace(/^generate_/, ''));
  }
  return unique(names).map(name => `tests/${name}.test.js`);
}

function sourceCandidatesForTest(file) {
  const base = path.basename(file).replace(/\.test\.js$/, '');
  const names = [base, `run_${base}`, `generate_${base}`];
  if (base.endsWith('_cli')) {
    const stripped = base.replace(/_cli$/, '');
    names.push(stripped, `run_${stripped}`, `generate_${stripped}`);
  }
  return unique(names);
}

function isSourceFile(file) {
  return (file.startsWith('src/') || file.startsWith('scripts/')) && file.endsWith('.js');
}

function isTestFile(file) {
  return file.startsWith('tests/') && file.endsWith('.test.js');
}

function sourceUntrackedReport(options = {}) {
  const root = path.resolve(options.root || ROOT);
  const files = (Array.isArray(options.files) ? options.files : listUntrackedFiles(root))
    .map(file => file.replace(/\\/g, '/'));
  const knownFiles = new Set(
    (Array.isArray(options.existingFiles) ? options.existingFiles : files.concat(listTrackedFiles(root)))
      .map(file => file.replace(/\\/g, '/'))
  );
  const sourceOrTestFiles = files
    .filter(file => classifyUntrackedFile(file) === 'source-or-test')
    .sort();
  const sourceFiles = sourceOrTestFiles.filter(isSourceFile);
  const testFiles = sourceOrTestFiles.filter(isTestFile);
  const knownSourcesByName = new Map();

  for (const file of knownFiles) {
    if (!isSourceFile(file)) continue;
    const name = path.basename(file, '.js');
    if (!knownSourcesByName.has(name)) knownSourcesByName.set(name, []);
    knownSourcesByName.get(name).push(file);
  }

  const paired = [];
  const sourceWithoutTests = [];
  for (const source of sourceFiles) {
    const test = testCandidatesForSource(source).find(candidate => knownFiles.has(candidate));
    if (test) {
      paired.push({ source, test });
    } else {
      sourceWithoutTests.push(source);
    }
  }

  const orphanTests = [];
  for (const test of testFiles) {
    const hasSource = sourceCandidatesForTest(test).some(sourceName => knownSourcesByName.has(sourceName));
    if (!hasSource) {
      orphanTests.push(test);
    }
  }

  return {
    root,
    total: sourceOrTestFiles.length,
    summary: {
      sourceFiles: sourceFiles.length,
      testFiles: testFiles.length,
      pairedSources: paired.length,
      sourceWithoutTests: sourceWithoutTests.length,
      pairedTests: testFiles.length - orphanTests.length,
      orphanTests: orphanTests.length,
    },
    paired,
    sourceWithoutTests,
    orphanTests,
  };
}

function listDateStampedExecuteScripts(root) {
  const dir = path.join(root, 'scripts', 'execute');
  return walkFiles(dir)
    .map(file => relFrom(root, file))
    .filter(file => /20\d\d[-_]\d\d[-_]\d\d/.test(file))
    .sort();
}

function listSuspiciousRootArtifacts(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => entry.name)
    .filter(name => SUSPICIOUS_ROOT_BASENAMES.has(name) || /^--/.test(name))
    .sort();
}

function addFinding(findings, finding) {
  findings.push({
    severity: finding.severity || 'warn',
    ...finding,
  });
}

function hygieneCheck(options = {}) {
  const root = path.resolve(options.root || ROOT);
  const thresholds = { ...DEFAULT_HYGIENE_THRESHOLDS, ...(options.thresholds || {}) };
  const findings = [];

  const rootArtifacts = listSuspiciousRootArtifacts(root);
  if (rootArtifacts.length > thresholds.maxRootArtifacts) {
    addFinding(findings, {
      id: 'root-artifacts',
      title: 'Suspicious root-level artifacts',
      detail: `${rootArtifacts.length} suspicious files found in project root.`,
      threshold: thresholds.maxRootArtifacts,
      value: rootArtifacts.length,
      paths: rootArtifacts,
    });
  }

  const runtimeDirs = [
    path.join(root, 'data', 'snapshots'),
    path.join(root, '.tmp'),
    path.join(root, 'tmp'),
  ].filter(dir => fs.existsSync(dir));
  for (const dir of runtimeDirs) {
    const stats = dirStatsForRoot(root, dir);
    if (stats.bytes > thresholds.snapshotBytes) {
      addFinding(findings, {
        id: 'large-runtime-dir',
        title: 'Large runtime directory',
        detail: `${stats.path} is ${stats.size}.`,
        threshold: formatBytes(thresholds.snapshotBytes),
        value: stats.size,
        path: stats.path,
        files: stats.files,
      });
    }
  }

  const packageScripts = readPackageScriptCount(root);
  if (packageScripts > thresholds.maxPackageScripts) {
    addFinding(findings, {
      id: 'too-many-package-scripts',
      title: 'package.json script count is high',
      detail: `${packageScripts} npm scripts found.`,
      threshold: thresholds.maxPackageScripts,
      value: packageScripts,
    });
  }

  const dateStampedExecuteScripts = listDateStampedExecuteScripts(root);
  if (dateStampedExecuteScripts.length > thresholds.maxDateStampedExecuteScripts) {
    addFinding(findings, {
      id: 'date-stamped-execute-scripts',
      title: 'Date-stamped execute scripts need archival review',
      detail: `${dateStampedExecuteScripts.length} date-stamped scripts found under scripts/execute.`,
      threshold: thresholds.maxDateStampedExecuteScripts,
      value: dateStampedExecuteScripts.length,
      paths: dateStampedExecuteScripts.slice(0, 30),
    });
  }

  const untrackedFiles = Array.isArray(options.untrackedFiles) ? options.untrackedFiles : listUntrackedFiles(root);
  if (untrackedFiles.length > thresholds.maxUntrackedFiles) {
    addFinding(findings, {
      id: 'too-many-untracked-files',
      title: 'Untracked file count is high',
      detail: `${untrackedFiles.length} untracked files found.`,
      threshold: thresholds.maxUntrackedFiles,
      value: untrackedFiles.length,
      paths: untrackedFiles.slice(0, 30),
    });
  }
  const reviewNeededUntracked = untrackedFiles.filter(file => classifyUntrackedFile(file) === 'review-needed');
  if (reviewNeededUntracked.length > thresholds.maxReviewNeededUntrackedFiles) {
    addFinding(findings, {
      id: 'review-needed-untracked-files',
      title: 'Unknown untracked files need review',
      detail: `${reviewNeededUntracked.length} untracked files are not in a known category.`,
      threshold: thresholds.maxReviewNeededUntrackedFiles,
      value: reviewNeededUntracked.length,
      paths: reviewNeededUntracked.slice(0, 30),
    });
  }
  const sourceAudit = sourceUntrackedReport({ root, files: untrackedFiles });
  if (sourceAudit.summary.sourceWithoutTests > thresholds.maxSourceWithoutTests) {
    addFinding(findings, {
      id: 'source-without-tests',
      title: 'Untracked source files need matching tests',
      detail: `${sourceAudit.summary.sourceWithoutTests} untracked source files do not have matching tests.`,
      threshold: thresholds.maxSourceWithoutTests,
      value: sourceAudit.summary.sourceWithoutTests,
      paths: sourceAudit.sourceWithoutTests.slice(0, 30),
    });
  }
  if (sourceAudit.summary.orphanTests > thresholds.maxOrphanSourceTests) {
    addFinding(findings, {
      id: 'orphan-source-tests',
      title: 'Untracked source tests need matching source files',
      detail: `${sourceAudit.summary.orphanTests} untracked tests do not have matching source files.`,
      threshold: thresholds.maxOrphanSourceTests,
      value: sourceAudit.summary.orphanTests,
      paths: sourceAudit.orphanTests.slice(0, 30),
    });
  }

  const largeFiles = findLargeFiles(root, thresholds.maxLargeFiles, thresholds.largeFileBytes);
  if (largeFiles.length) {
    addFinding(findings, {
      id: 'large-files',
      title: 'Large files found in workspace',
      detail: `${largeFiles.length} files are at least ${formatBytes(thresholds.largeFileBytes)}.`,
      threshold: formatBytes(thresholds.largeFileBytes),
      value: largeFiles.length,
      files: largeFiles,
    });
  }

  return {
    ok: findings.length === 0,
    root,
    thresholds: {
      ...thresholds,
      snapshotSize: formatBytes(thresholds.snapshotBytes),
      largeFileSize: formatBytes(thresholds.largeFileBytes),
    },
    findings,
  };
}

function report(options = {}) {
  const mcp = options.skipMcp ? [] : listMcpProcesses();
  const mcpBytes = mcp.reduce((sum, item) => sum + Number(item.WorkingSetSize || 0), 0);
  return {
    root: ROOT,
    gitStatus: options.skipGitStatus ? null : timedGitStatus(),
    chromeDevtoolsMcp: {
      processes: mcp.length,
      memory: formatBytes(mcpBytes),
    },
    directories: REPORT_DIRS.map(dirStats),
    largestFiles: largestFiles(),
  };
}

function print(value, asJson = false) {
  if (asJson) {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0] || 'report';
  if (command === 'report') {
    print(report(), args.json);
    return;
  }
  if (command === 'stop-mcp') {
    print(stopMcpProcesses(), args.json);
    return;
  }
  if (command === 'archive') {
    print(archiveRuntime(args), args.json);
    return;
  }
  if (command === 'hygiene-check') {
    print(hygieneCheck(), args.json);
    return;
  }
  if (command === 'untracked-report') {
    print(untrackedReport(), args.json);
    return;
  }
  if (command === 'source-untracked-report') {
    print(sourceUntrackedReport(), args.json);
    return;
  }
  throw new Error(`Unknown command: ${command}`);
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
  classifyUntrackedFile,
  report,
  hygieneCheck,
  sourceUntrackedReport,
  untrackedReport,
};
