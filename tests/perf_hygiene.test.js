const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { report } = require('../scripts/maintenance/perf_hygiene');
const {
  classifyUntrackedFile,
  hygieneCheck,
  sourceUntrackedReport,
  untrackedReport,
} = require('../scripts/maintenance/perf_hygiene');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'perf-hygiene-'));
}

function write(file, body = '') {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
}

{
  const result = report({ skipGitStatus: true, skipMcp: true });
  const paths = result.directories.map(item => item.path);
  assert.ok(paths.includes('data/snapshots'));
  assert.ok(paths.includes('discovery/output'));
  assert.ok(paths.includes('outputs'));
}

{
  const root = makeTempDir();
  write(path.join(root, 'package.json'), JSON.stringify({
    scripts: {
      a: 'node a.js',
      b: 'node b.js',
      c: 'node c.js',
    },
  }));
  write(path.join(root, '--json'), 'mistaken root artifact');
  write(path.join(root, 'scripts', 'execute', 'sku_bidup_2026-06-17.js'), 'console.log("one-off");');
  write(path.join(root, 'data', 'snapshots', 'large.json'), 'x'.repeat(32));

  const result = hygieneCheck({
    root,
    thresholds: {
      snapshotBytes: 16,
      maxPackageScripts: 2,
      maxDateStampedExecuteScripts: 0,
      maxRootArtifacts: 0,
    },
  });

  assert.strictEqual(result.ok, false);
  assert(result.findings.some(item => item.id === 'root-artifacts'));
  assert(result.findings.some(item => item.id === 'large-runtime-dir'));
  assert(result.findings.some(item => item.id === 'too-many-package-scripts'));
  assert(result.findings.some(item => item.id === 'date-stamped-execute-scripts'));
}

{
  const root = makeTempDir();
  write(path.join(root, 'package.json'), JSON.stringify({ scripts: {} }));
  write(path.join(root, 'tools', 'chrome-for-testing', 'chrome.dll'), 'x'.repeat(32));
  write(path.join(root, 'data', 'snapshots', 'latest_snapshot.json'), 'x'.repeat(32));
  write(path.join(root, 'unexpected.bin'), 'x'.repeat(32));

  const result = hygieneCheck({
    root,
    thresholds: {
      largeFileBytes: 16,
      snapshotBytes: 1024,
    },
  });
  const largeFileFinding = result.findings.find(item => item.id === 'large-files');

  assert(largeFileFinding);
  assert.deepStrictEqual(largeFileFinding.files.map(item => item.path), ['unexpected.bin']);
}

{
  const result = hygieneCheck({
    root: makeTempDir(),
    untrackedFiles: ['a.txt', 'b.txt', 'c.txt'],
    thresholds: {
      maxUntrackedFiles: 2,
    },
  });

  assert.strictEqual(result.ok, false);
  assert(result.findings.some(item => item.id === 'too-many-untracked-files'));
}

{
  const result = hygieneCheck({
    root: makeTempDir(),
    untrackedFiles: ['data/actions/a.json', 'unknown.bin'],
    thresholds: {
      maxUntrackedFiles: 10,
      maxReviewNeededUntrackedFiles: 0,
    },
  });

  assert.strictEqual(result.ok, false);
  assert(result.findings.some(item => item.id === 'review-needed-untracked-files'));
}

{
  assert.strictEqual(classifyUntrackedFile('data/actions/a.json'), 'business-evidence');
  assert.strictEqual(classifyUntrackedFile('data/learning/a.md'), 'business-memory');
  assert.strictEqual(classifyUntrackedFile('src/new_module.js'), 'source-or-test');
  assert.strictEqual(classifyUntrackedFile('tests/new_module.test.js'), 'source-or-test');
  assert.strictEqual(classifyUntrackedFile('config/example.json'), 'config-or-doc');
  assert.strictEqual(classifyUntrackedFile('unknown.bin'), 'review-needed');
}

{
  const result = untrackedReport({
    root: makeTempDir(),
    files: [
      'data/actions/a.json',
      'data/actions/b.json',
      'src/new_module.js',
      'unknown.bin',
    ],
  });

  assert.strictEqual(result.total, 4);
  assert.deepStrictEqual(result.categories.map(item => [item.category, item.count]), [
    ['business-evidence', 2],
    ['review-needed', 1],
    ['source-or-test', 1],
  ]);
}

{
  const result = sourceUntrackedReport({
    root: makeTempDir(),
    files: [
      'src/foo.js',
      'scripts/run_bar.js',
      'scripts/no_test.js',
      'tests/foo.test.js',
      'tests/run_bar.test.js',
      'tests/orphan.test.js',
      'data/actions/a.json',
    ],
    existingFiles: [
      'src/foo.js',
      'scripts/run_bar.js',
      'scripts/no_test.js',
      'tests/foo.test.js',
      'tests/run_bar.test.js',
      'tests/orphan.test.js',
    ],
  });

  assert.strictEqual(result.total, 6);
  assert.deepStrictEqual(result.summary, {
    sourceFiles: 3,
    testFiles: 3,
    pairedSources: 2,
    sourceWithoutTests: 1,
    pairedTests: 2,
    orphanTests: 1,
  });
  assert.deepStrictEqual(result.sourceWithoutTests, ['scripts/no_test.js']);
  assert.deepStrictEqual(result.orphanTests, ['tests/orphan.test.js']);
  assert.deepStrictEqual(result.paired.map(item => [item.source, item.test]), [
    ['scripts/run_bar.js', 'tests/run_bar.test.js'],
    ['src/foo.js', 'tests/foo.test.js'],
  ]);
}

console.log('perf_hygiene tests passed');
