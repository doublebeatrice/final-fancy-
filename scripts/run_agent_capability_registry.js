const fs = require('fs');
const path = require('path');
const { buildCapabilityRegistry } = require('../src/agent_capability_registry');
const { buildOpsTimeContext } = require('../src/ops_time');

const ROOT = path.join(__dirname, '..');
const DEFAULT_OUT_DIR = path.join(ROOT, 'data', 'agent');

function readJson(file, fallback) {
  if (!file) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    if (fallback !== undefined) return fallback;
    throw error;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const get = name => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : '';
  };
  return {
    inputFile: get('--file') || process.env.AGENT_CAPABILITY_FILE || '',
    outFile: get('--out') || process.env.AGENT_CAPABILITY_OUT || '',
    name: get('--name') || '',
    sourceSystem: get('--system') || '',
    surface: get('--surface') || '',
    operationType: get('--operation') || '',
    method: get('--method') || '',
    path: get('--path') || get('--url') || '',
    site: get('--site') || process.env.AD_OPS_SITE || 'Amazon.com',
    now: get('--now') || process.env.AGENT_NOW || '',
    sourceRunId: get('--source-run-id') || process.env.SOURCE_RUN_ID || '',
    includeDefaults: !args.includes('--no-defaults') && process.env.AGENT_CAPABILITY_INCLUDE_DEFAULTS !== '0',
  };
}

function defaultOutFile(timeContext) {
  return path.join(DEFAULT_OUT_DIR, `capability_registry_${timeContext.businessDate}.json`);
}

function capabilityFromArgs(options = {}) {
  if (!options.name && !options.path) return null;
  return {
    name: options.name || options.path,
    sourceSystem: options.sourceSystem || 'unknown',
    surface: options.surface || 'general',
    operationType: options.operationType || '',
    endpoint: {
      method: options.method || '',
      path: options.path || '',
    },
    contract: {
      params: [],
      responseFields: [],
    },
    verification: {},
  };
}

function capabilitiesFromInput(raw) {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.capabilities)) return raw.capabilities;
  if (raw && typeof raw === 'object') return [raw];
  return [];
}

function runAgentCapabilityRegistry(options = {}) {
  const timeContext = options.timeContext || buildOpsTimeContext({
    now: options.now ? new Date(options.now) : new Date(),
    site: options.site || 'Amazon.com',
    sourceRunId: options.sourceRunId || `capability_registry_${Date.now()}`,
  });
  const fileCapabilities = capabilitiesFromInput(readJson(options.inputFile, []));
  const inlineCapability = capabilityFromArgs(options);
  const includeDefaults = options.includeDefaults !== undefined ? options.includeDefaults : true;
  const capabilities = options.capabilities || [...fileCapabilities, ...(inlineCapability ? [inlineCapability] : [])];
  const registry = buildCapabilityRegistry({ capabilities, includeDefaults, timeContext });
  const outFile = options.outFile || defaultOutFile(timeContext);
  writeJson(outFile, registry);
  return registry;
}

function main() {
  const options = parseArgs(process.argv);
  const registry = runAgentCapabilityRegistry(options);
  const outFile = options.outFile || defaultOutFile(registry);
  console.log(JSON.stringify({
    ok: true,
    businessDate: registry.businessDate,
    outFile,
    summary: registry.summary,
  }, null, 2));
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.stack || error.message);
    process.exit(1);
  }
}

module.exports = {
  capabilitiesFromInput,
  parseArgs,
  runAgentCapabilityRegistry,
};
