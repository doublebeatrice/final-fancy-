const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  createConversationBackup,
  inspectConversationState,
  restoreConversationBackup,
} = require('../scripts/maintenance/codex_conversation_guard');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codex-conversation-guard-'));
}

function write(file, body) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
}

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function makeCodexHome() {
  const root = makeTempDir();
  write(path.join(root, 'session_index.jsonl'), '{"id":"thread-1"}\n');
  write(path.join(root, '.codex-global-state.json'), '{"projectless-thread-ids":["thread-1"]}');
  write(path.join(root, 'sessions', '2026', '06', '15', 'rollout-thread-1.jsonl'), '{"type":"turn"}\n');
  write(path.join(root, 'archived_sessions', 'rollout-thread-2.jsonl'), '{"type":"archived"}\n');
  write(path.join(root, 'sqlite', 'state_5.sqlite'), 'state-db');
  write(path.join(root, 'sqlite', 'state_5.sqlite-wal'), 'wal');
  write(path.join(root, 'sqlite', 'state_5.sqlite-shm'), 'shm');
  write(path.join(root, 'state_5.sqlite'), 'legacy-state-db');
  write(path.join(root, 'auth.json'), '{"OPENAI_API_KEY":"secret"}');
  write(path.join(root, '.cockpit_codex_auth.json'), '{"email":"secret@example.com"}');
  return root;
}

function listFiles(root) {
  const result = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else {
        result.push(path.relative(root, full).replace(/\\/g, '/'));
      }
    }
  }
  walk(root);
  return result.sort();
}

{
  const codexHome = makeCodexHome();
  const state = inspectConversationState({ codexHome });

  assert.strictEqual(state.sessionIndexLines, 1);
  assert.strictEqual(state.activeSessionFiles, 1);
  assert.strictEqual(state.archivedSessionFiles, 1);
  assert.strictEqual(state.sqliteStatePresent, true);
  assert.strictEqual(state.legacyStatePresent, true);
}

{
  const codexHome = makeCodexHome();
  const backupRoot = path.join(makeTempDir(), 'backups');
  const backup = createConversationBackup({ codexHome, backupRoot, label: 'before-switch' });
  const files = listFiles(backup.dir);

  assert(files.includes('manifest.json'));
  assert(files.includes('files/session_index.jsonl'));
  assert(files.includes('files/.codex-global-state.json'));
  assert(files.includes('files/sessions/2026/06/15/rollout-thread-1.jsonl'));
  assert(files.includes('files/archived_sessions/rollout-thread-2.jsonl'));
  assert(files.includes('files/sqlite/state_5.sqlite'));
  assert(files.includes('files/state_5.sqlite'));
  assert(!files.includes('files/auth.json'));
  assert(!files.includes('files/.cockpit_codex_auth.json'));

  const manifest = JSON.parse(read(path.join(backup.dir, 'manifest.json')));
  assert.strictEqual(manifest.kind, 'codex-conversation-visibility-backup');
  assert.strictEqual(manifest.excludesAuth, true);
}

{
  const codexHome = makeCodexHome();
  const backupRoot = path.join(makeTempDir(), 'backups');
  const backup = createConversationBackup({ codexHome, backupRoot, label: 'restore' });

  fs.rmSync(path.join(codexHome, 'sessions'), { recursive: true, force: true });
  fs.rmSync(path.join(codexHome, 'archived_sessions'), { recursive: true, force: true });
  fs.writeFileSync(path.join(codexHome, 'session_index.jsonl'), '');
  fs.writeFileSync(path.join(codexHome, 'auth.json'), '{"OPENAI_API_KEY":"new-secret"}');

  const restored = restoreConversationBackup({ codexHome, backupDir: backup.dir });

  assert.strictEqual(restored.restoredFiles > 0, true);
  assert.strictEqual(read(path.join(codexHome, 'session_index.jsonl')), '{"id":"thread-1"}\n');
  assert.strictEqual(read(path.join(codexHome, 'sessions', '2026', '06', '15', 'rollout-thread-1.jsonl')), '{"type":"turn"}\n');
  assert.strictEqual(read(path.join(codexHome, 'archived_sessions', 'rollout-thread-2.jsonl')), '{"type":"archived"}\n');
  assert.strictEqual(read(path.join(codexHome, 'auth.json')), '{"OPENAI_API_KEY":"new-secret"}');
}

console.log('codex_conversation_guard tests passed');
