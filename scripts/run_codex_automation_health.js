const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_DEPRECATED_MODELS = new Set(['gpt-5.2', 'gpt-5.3-codex']);

function text(value) {
  return String(value ?? '').trim();
}

function stripQuotes(value) {
  const raw = text(value);
  const match = raw.match(/^(['"])([\s\S]*)\1$/);
  return match ? match[2] : raw;
}

function parseTomlScalarLines(body) {
  const result = {};
  let section = '';
  for (const rawLine of String(body || '').split(/\r?\n/)) {
    const line = rawLine.replace(/\s+#.*$/, '').trim();
    if (!line || line.startsWith('#')) continue;
    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      section = sectionMatch[1].trim();
      continue;
    }
    const match = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/);
    if (!match) continue;
    const key = section ? `${section}.${match[1]}` : match[1];
    result[key] = stripQuotes(match[2].trim().replace(/,$/, ''));
  }
  return result;
}

function readTomlScalars(file) {
  if (!file || !fs.existsSync(file)) return {};
  return parseTomlScalarLines(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

function listAutomationFiles(automationsDir) {
  if (!automationsDir || !fs.existsSync(automationsDir)) return [];
  return fs.readdirSync(automationsDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => path.join(automationsDir, entry.name, 'automation.toml'))
    .filter(file => fs.existsSync(file))
    .sort((a, b) => a.localeCompare(b));
}

function resolveCodexCommand(env = process.env, existsSync = fs.existsSync, nodeExe = process.execPath) {
  const appData = text(env.APPDATA);
  const codexJs = appData ? path.join(appData, 'npm', 'node_modules', '@openai', 'codex', 'bin', 'codex.js') : '';
  if (codexJs && existsSync(codexJs)) {
    return {
      bin: nodeExe,
      prefixArgs: [codexJs],
    };
  }
  return {
    bin: 'codex',
    prefixArgs: [],
  };
}

function inspectCodexAutomationHealth(options = {}) {
  const codexHome = options.codexHome || process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  const configFile = options.configFile || path.join(codexHome, 'config.toml');
  const automationsDir = options.automationsDir || path.join(codexHome, 'automations');
  const deprecatedModels = options.deprecatedModels || DEFAULT_DEPRECATED_MODELS;
  const configToml = readTomlScalars(configFile);
  const modelProvider = configToml.model_provider || 'openai';
  const providerPrefix = `model_providers.${modelProvider}.`;
  const config = {
    codexHome,
    configFile,
    automationsDir,
    model: configToml.model || '',
    modelProvider,
    wireApi: configToml[`${providerPrefix}wire_api`] || (modelProvider === 'openai' ? 'responses' : ''),
    baseUrl: configToml[`${providerPrefix}base_url`] || '',
  };

  const automations = listAutomationFiles(automationsDir).map(file => {
    const values = readTomlScalars(file);
    return {
      file,
      id: values.id || path.basename(path.dirname(file)),
      name: values.name || '',
      status: values.status || '',
      model: values.model || '',
      rrule: values.rrule || '',
    };
  });
  const activeAutomations = automations.filter(item => item.status !== 'PAUSED');
  const blockers = [];
  const warnings = [];

  if (!config.model) {
    blockers.push({ code: 'default_model_missing', detail: configFile });
  } else if (deprecatedModels.has(config.model)) {
    blockers.push({ code: 'default_model_deprecated', model: config.model, detail: configFile });
  }

  if (config.modelProvider !== 'openai' && config.wireApi !== 'responses') {
    blockers.push({
      code: 'provider_wire_api_not_responses',
      provider: config.modelProvider,
      wireApi: config.wireApi || '(missing)',
      detail: configFile,
    });
  }

  for (const automation of activeAutomations) {
    if (automation.rrule && !/^RRULE:/i.test(automation.rrule)) {
      blockers.push({
        code: 'automation_rrule_missing_prefix',
        id: automation.id,
        name: automation.name,
        rrule: automation.rrule,
        detail: automation.file,
      });
    }
    if (!automation.model) {
      warnings.push({ code: 'automation_model_missing_uses_default', id: automation.id, detail: automation.file });
      continue;
    }
    if (deprecatedModels.has(automation.model)) {
      blockers.push({
        code: 'automation_deprecated_model',
        id: automation.id,
        name: automation.name,
        model: automation.model,
        detail: automation.file,
      });
    }
  }

  return {
    ok: blockers.length === 0,
    config,
    automations,
    activeAutomations,
    blockers,
    warnings,
  };
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const get = name => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : '';
  };
  return {
    codexHome: get('--codex-home') || process.env.CODEX_HOME || '',
    configFile: get('--config') || '',
    automationsDir: get('--automations-dir') || '',
    probeModel: get('--probe-model') || '',
    probe: args.includes('--probe'),
    json: args.includes('--json'),
  };
}

function runModelProbe(model) {
  if (!text(model)) return null;
  const command = resolveCodexCommand();
  try {
    const stdout = childProcess.execFileSync(command.bin, [
      ...command.prefixArgs,
      'exec',
      '-m', text(model),
      '-s', 'read-only',
      '--ephemeral',
      '--ignore-rules',
      'Reply with exactly: OK-CODEX-HEALTH',
    ], {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 120000,
    });
    return {
      ok: stdout.includes('OK-CODEX-HEALTH'),
      model: text(model),
      summary: stdout.replace(/\s+/g, ' ').slice(0, 500),
    };
  } catch (error) {
    return {
      ok: false,
      model: text(model),
      summary: text(error.stderr || error.stdout || error.message).replace(/\s+/g, ' ').slice(0, 800),
    };
  }
}

function main() {
  const options = parseArgs(process.argv);
  const result = inspectCodexAutomationHealth(options);
  const probeModel = options.probeModel || result.config.model;
  if (options.probe) result.modelProbe = runModelProbe(probeModel);
  const finalOk = result.ok && (!result.modelProbe || result.modelProbe.ok);
  result.ok = finalOk;
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`Codex automation health: ${finalOk ? 'ok' : 'blocked'}`);
    console.log(`config: model=${result.config.model || '(missing)'} provider=${result.config.modelProvider} wire_api=${result.config.wireApi || '(missing)'}`);
    console.log(`active automations: ${result.activeAutomations.length}`);
    for (const blocker of result.blockers) console.log(`BLOCKER ${blocker.code}: ${blocker.id || blocker.provider || blocker.model || ''} ${blocker.detail || ''}`.trim());
    for (const warning of result.warnings) console.log(`WARN ${warning.code}: ${warning.id || ''} ${warning.detail || ''}`.trim());
    if (result.modelProbe) console.log(`probe ${result.modelProbe.model}: ${result.modelProbe.ok ? 'ok' : 'failed'}`);
  }
  if (!finalOk) process.exitCode = 1;
}

if (require.main === module) main();

module.exports = {
  inspectCodexAutomationHealth,
  parseTomlScalarLines,
  resolveCodexCommand,
  runModelProbe,
};
