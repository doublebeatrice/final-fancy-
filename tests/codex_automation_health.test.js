const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  inspectCodexAutomationHealth,
  resolveCodexCommand,
} = require('../scripts/run_codex_automation_health');

function writeFile(file, body) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body, 'utf8');
}

async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-automation-health-'));
  const codexHome = path.join(tmpDir, '.codex');
  const configFile = path.join(codexHome, 'config.toml');
  const automationsDir = path.join(codexHome, 'automations');

  writeFile(configFile, [
    'model = "gpt-5.5"',
    'model_provider = "proxy"',
    '',
    '[model_providers.proxy]',
    'base_url = "https://proxy.example.com/v1"',
    'wire_api = "responses"',
  ].join('\n'));
  writeFile(path.join(automationsDir, 'automation', 'automation.toml'), [
    'id = "automation"',
    'kind = "cron"',
    'name = "daily"',
    'status = "ACTIVE"',
    'model = "gpt-5.5"',
  ].join('\n'));

  const healthy = inspectCodexAutomationHealth({
    codexHome,
    configFile,
    automationsDir,
  });
  assert.strictEqual(healthy.ok, true);
  assert.deepStrictEqual(healthy.blockers, []);
  assert.strictEqual(healthy.activeAutomations.length, 1);
  assert.strictEqual(healthy.config.model, 'gpt-5.5');
  assert.strictEqual(healthy.config.wireApi, 'responses');

  writeFile(path.join(automationsDir, 'automation-bad-rrule', 'automation.toml'), [
    'id = "automation-bad-rrule"',
    'kind = "cron"',
    'name = "bad schedule"',
    'status = "ACTIVE"',
    'rrule = "FREQ=WEEKLY;BYDAY=MO;BYHOUR=9;BYMINUTE=30"',
    'model = "gpt-5.5"',
  ].join('\n'));
  const badRrule = inspectCodexAutomationHealth({
    codexHome,
    configFile,
    automationsDir,
  });
  assert.strictEqual(badRrule.ok, false);
  assert.ok(badRrule.blockers.some(item => item.code === 'automation_rrule_missing_prefix'));
  fs.rmSync(path.join(automationsDir, 'automation-bad-rrule'), { recursive: true, force: true });

  writeFile(path.join(automationsDir, 'automation-legacy', 'automation.toml'), [
    'id = "automation-legacy"',
    'kind = "cron"',
    'name = "legacy"',
    'status = "ACTIVE"',
    'model = "gpt-5.3-codex"',
  ].join('\n'));
  const legacy = inspectCodexAutomationHealth({
    codexHome,
    configFile,
    automationsDir,
  });
  assert.strictEqual(legacy.ok, false);
  assert.ok(legacy.blockers.some(item => item.code === 'automation_deprecated_model'));

  writeFile(configFile, [
    'model = "gpt-5.5"',
    'model_provider = "proxy"',
    '',
    '[model_providers.proxy]',
    'base_url = "https://proxy.example.com/v1"',
    'wire_api = "chat"',
  ].join('\n'));
  const badWire = inspectCodexAutomationHealth({
    codexHome,
    configFile,
    automationsDir,
  });
  assert.strictEqual(badWire.ok, false);
  assert.ok(badWire.blockers.some(item => item.code === 'provider_wire_api_not_responses'));

  assert.deepStrictEqual(resolveCodexCommand({
    APPDATA: 'C:\\Users\\Administrator\\AppData\\Roaming',
  }, file => file.endsWith('codex.js'), 'D:\\node\\node.exe'), {
    bin: 'D:\\node\\node.exe',
    prefixArgs: ['C:\\Users\\Administrator\\AppData\\Roaming\\npm\\node_modules\\@openai\\codex\\bin\\codex.js'],
  });
  assert.deepStrictEqual(resolveCodexCommand({}, () => false, 'D:\\node\\node.exe'), {
    bin: 'codex',
    prefixArgs: [],
  });
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
