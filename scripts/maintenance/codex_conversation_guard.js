const fs = require('fs');
const os = require('os');
const path = require('path');

const BACKUP_KIND = 'codex-conversation-visibility-backup';
const FILES = [
  'session_index.jsonl',
  '.codex-global-state.json',
  '.codex-global-state.json.bak',
  'state_5.sqlite',
  'state_5.sqlite-shm',
  'state_5.sqlite-wal',
  path.join('sqlite', 'state_5.sqlite'),
  path.join('sqlite', 'state_5.sqlite-shm'),
  path.join('sqlite', 'state_5.sqlite-wal'),
];
const DIRS = [
  'sessions',
  'archived_sessions',
];
const AUTH_FILE_RE = /(^|[\\/])(\.?cockpit_)?codex_auth\.json$|(^|[\\/])auth\.json$|(^|[\\/]).*auth.*\.json$|(^|[\\/]).*token.*|(^|[\\/]).*secret.*/i;

function defaultCodexHome() {
  return process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
}

function timestamp() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return [
    d.getFullYear(),
    pad(d.getMonth() + 1),
    pad(d.getDate()),
    '-',
    pad(d.getHours()),
    pad(d.getMinutes()),
    pad(d.getSeconds()),
  ].join('');
}

function safeLabel(label) {
  return String(label || 'manual')
    .trim()
    .replace(/[^A-Za-z0-9_.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'manual';
}

function ensureInside(parent, target) {
  const parentResolved = path.resolve(parent);
  const targetResolved = path.resolve(target);
  const relative = path.relative(parentResolved, targetResolved);
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) return;
  throw new Error(`Refusing path outside target root: ${target}`);
}

function copyFile(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function copyDir(source, target, copied) {
  if (!fs.existsSync(source)) return;
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    if (AUTH_FILE_RE.test(sourcePath)) continue;
    if (entry.isDirectory()) {
      copyDir(sourcePath, targetPath, copied);
    } else if (entry.isFile()) {
      copyFile(sourcePath, targetPath);
      copied.push(targetPath);
    }
  }
}

function countFiles(dir, filter = () => true) {
  if (!fs.existsSync(dir)) return 0;
  let count = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) count += countFiles(full, filter);
    else if (entry.isFile() && filter(full)) count += 1;
  }
  return count;
}

function countLines(file) {
  if (!fs.existsSync(file)) return 0;
  const body = fs.readFileSync(file, 'utf8');
  if (!body) return 0;
  return body.split(/\r?\n/).filter(Boolean).length;
}

function inspectConversationState(options = {}) {
  const codexHome = path.resolve(options.codexHome || defaultCodexHome());
  return {
    codexHome,
    sessionIndexLines: countLines(path.join(codexHome, 'session_index.jsonl')),
    activeSessionFiles: countFiles(path.join(codexHome, 'sessions'), file => file.endsWith('.jsonl')),
    archivedSessionFiles: countFiles(path.join(codexHome, 'archived_sessions'), file => file.endsWith('.jsonl')),
    globalStatePresent: fs.existsSync(path.join(codexHome, '.codex-global-state.json')),
    sqliteStatePresent: fs.existsSync(path.join(codexHome, 'sqlite', 'state_5.sqlite')),
    legacyStatePresent: fs.existsSync(path.join(codexHome, 'state_5.sqlite')),
  };
}

function createConversationBackup(options = {}) {
  const codexHome = path.resolve(options.codexHome || defaultCodexHome());
  const backupRoot = path.resolve(options.backupRoot || path.join(codexHome, 'conversation_backups'));
  const backupDir = path.join(backupRoot, `${timestamp()}-${safeLabel(options.label)}`);
  const filesRoot = path.join(backupDir, 'files');
  const copied = [];

  ensureInside(backupRoot, backupDir);
  fs.mkdirSync(filesRoot, { recursive: true });

  for (const rel of FILES) {
    const source = path.join(codexHome, rel);
    if (!fs.existsSync(source) || AUTH_FILE_RE.test(source)) continue;
    const target = path.join(filesRoot, rel);
    copyFile(source, target);
    copied.push(target);
  }
  for (const rel of DIRS) {
    copyDir(path.join(codexHome, rel), path.join(filesRoot, rel), copied);
  }

  const manifest = {
    kind: BACKUP_KIND,
    createdAt: new Date().toISOString(),
    codexHome,
    excludesAuth: true,
    restoredBy: path.basename(__filename),
    state: inspectConversationState({ codexHome }),
    fileCount: copied.length,
    protectedAuthFiles: [
      'auth.json',
      '.cockpit_codex_auth.json',
    ],
  };
  fs.writeFileSync(path.join(backupDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return { dir: backupDir, manifest, copiedFiles: copied.length };
}

function restoreConversationBackup(options = {}) {
  const codexHome = path.resolve(options.codexHome || defaultCodexHome());
  const backupDir = path.resolve(options.backupDir || '');
  if (!backupDir) throw new Error('Missing --backup-dir');
  const manifestPath = path.join(backupDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) throw new Error(`Missing manifest: ${manifestPath}`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.kind !== BACKUP_KIND || manifest.excludesAuth !== true) {
    throw new Error(`Refusing unsupported backup: ${backupDir}`);
  }

  const filesRoot = path.join(backupDir, 'files');
  ensureInside(backupDir, filesRoot);
  const restored = [];
  copyDir(filesRoot, codexHome, restored);
  return {
    backupDir,
    codexHome,
    restoredFiles: restored.length,
    state: inspectConversationState({ codexHome }),
  };
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const get = name => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : '';
  };
  return {
    command: args.find(arg => !arg.startsWith('--')) || 'status',
    codexHome: get('--codex-home') || '',
    backupRoot: get('--backup-root') || '',
    backupDir: get('--backup-dir') || '',
    label: get('--label') || '',
    json: args.includes('--json'),
  };
}

function printResult(result, json) {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (result.dir) {
    console.log(`backup: ${result.dir}`);
    console.log(`files: ${result.copiedFiles}`);
    console.log('auth: excluded');
    return;
  }
  if (result.restoredFiles !== undefined) {
    console.log(`restored files: ${result.restoredFiles}`);
    console.log(`codex home: ${result.codexHome}`);
    return;
  }
  console.log(`codex home: ${result.codexHome}`);
  console.log(`session index lines: ${result.sessionIndexLines}`);
  console.log(`active sessions: ${result.activeSessionFiles}`);
  console.log(`archived sessions: ${result.archivedSessionFiles}`);
  console.log(`global state: ${result.globalStatePresent ? 'present' : 'missing'}`);
  console.log(`sqlite state: ${result.sqliteStatePresent ? 'present' : 'missing'}`);
  console.log(`legacy state: ${result.legacyStatePresent ? 'present' : 'missing'}`);
}

function main() {
  const options = parseArgs(process.argv);
  let result;
  if (options.command === 'status') {
    result = inspectConversationState(options);
  } else if (options.command === 'backup') {
    result = createConversationBackup(options);
  } else if (options.command === 'restore') {
    result = restoreConversationBackup(options);
  } else {
    throw new Error(`Unknown command: ${options.command}`);
  }
  printResult(result, options.json);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  createConversationBackup,
  inspectConversationState,
  restoreConversationBackup,
};
