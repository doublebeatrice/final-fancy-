const {
  DEFAULT_CONFIG,
  PROVIDER_DEFAULTS,
  loadConfig,
  queryVworkApi,
} = require('../src/wecom_gateway');
const childProcess = require('child_process');

function parseArgs(argv) {
  const args = argv.slice(2);
  const get = name => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : '';
  };
  return {
    configFile: get('--config') || process.env.WECOM_GATEWAY_CONFIG || '',
    provider: get('--provider') || process.env.WECOM_PROVIDER || '',
    supportedVersion: get('--supported-version') || process.env.WECOM_SUPPORTED_VERSION || '',
    apiPort: get('--api-port') || process.env.WECOM_API_PORT || '',
    dllPort: get('--dll-port') || process.env.WECOM_DLL_PORT || '',
    installedVersion: get('--installed-version') || process.env.WECOM_INSTALLED_VERSION || '',
    sendFileAssist: get('--send-file-assist') || '',
  };
}

function buildConfig(options = {}) {
  const loaded = loadConfig(options.configFile);
  const provider = options.provider || loaded.provider || DEFAULT_CONFIG.provider;
  const providerDefaults = PROVIDER_DEFAULTS[provider] || {};
  return {
    ...DEFAULT_CONFIG,
    ...providerDefaults,
    ...loaded,
    provider,
    supportedWecomVersion: options.supportedVersion || (options.provider ? providerDefaults.supportedWecomVersion : loaded.supportedWecomVersion) || DEFAULT_CONFIG.supportedWecomVersion,
    ...(options.apiPort ? { apiPort: Number(options.apiPort), dllPort: Number(options.apiPort) } : {}),
    ...(options.dllPort ? { apiPort: Number(options.dllPort), dllPort: Number(options.dllPort) } : {}),
  };
}

async function safeCall(label, payload, config) {
  try {
    const response = await queryVworkApi(payload, config);
    return {
      label,
      ok: response.statusCode >= 200 && response.statusCode < 300,
      request: payload,
      response,
    };
  } catch (error) {
    return {
      label,
      ok: false,
      request: payload,
      error: error.code || error.message,
      message: error.message,
    };
  }
}

function readInstalledWecomVersion() {
  try {
    const output = childProcess.execFileSync('reg', [
      'query',
      'HKCU\\Software\\Tencent\\WXWork',
      '/v',
      'Version',
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const match = output.match(/\bVersion\s+REG_\w+\s+([^\r\n]+)/i);
    return match ? match[1].trim() : '';
  } catch (error) {
    return '';
  }
}

function assessVersion(config = {}, installedVersion = '') {
  const expected = config.supportedWecomVersion || '';
  const installed = installedVersion || '';
  if (!expected || expected === 'n/a') return 'unknown';
  if (!installed) return 'unknown';
  return installed === expected ? 'match' : 'mismatch';
}

async function runVworkProbe(options = {}) {
  const config = buildConfig(options);
  const installedWecomVersion = options.installedVersion || readInstalledWecomVersion();
  const versionStatus = assessVersion(config, installedWecomVersion);
  const checks = [
    await safeCall('login_status:type_1000', { type: 1000 }, config),
    await safeCall('account_info:type_1002', { type: 1002 }, config),
  ];
  if (options.sendFileAssist) {
    checks.push(await safeCall('send_text_fileassist:type_3000', {
      type: 3000,
      user_id: 'FILEASSIST',
      msg: options.sendFileAssist,
    }, config));
  }
  return {
    ok: checks.every(check => check.ok),
    provider: config.provider,
    supportedWecomVersion: config.supportedWecomVersion,
    installedWecomVersion,
    versionStatus,
    providerApi: `http://${config.apiHost}:${config.apiPort}${config.apiPath}`,
    checkedTypes: checks.map(check => check.request.type),
    checks,
  };
}

async function main() {
  const result = await runVworkProbe(parseArgs(process.argv));
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = {
  assessVersion,
  buildConfig,
  readInstalledWecomVersion,
  parseArgs,
  runVworkProbe,
};
