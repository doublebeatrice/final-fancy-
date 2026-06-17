const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { report } = require('../scripts/maintenance/perf_hygiene');
const { hygieneCheck } = require('../scripts/maintenance/perf_hygiene');

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

console.log('perf_hygiene tests passed');
