const { buildConfig, runVworkProbe } = require('./run_wecom_vwork_probe');

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
    requireVersionMatch: args.includes('--require-version-match'),
  };
}

function bridgeContractFromProbe(probe = {}, config = {}, options = {}) {
  const checks = probe.checks || [];
  const byLabel = Object.fromEntries(checks.map(check => [check.label, check]));
  const loginOk = Boolean(byLabel['login_status:type_1000']?.ok);
  const accountOk = Boolean(byLabel['account_info:type_1002']?.ok);
  const sendOk = options.sendFileAssist ? Boolean(byLabel['send_text_fileassist:type_3000']?.ok) : null;
  const callbackLoopback = ['127.0.0.1', 'localhost', '::1'].includes(config.callbackHost);
  const versionOk = probe.versionStatus === 'match' || (!options.requireVersionMatch && probe.versionStatus === 'unknown');
  const blockers = [];
  const warnings = [];

  if (!loginOk) blockers.push('login_status_api_failed');
  if (!accountOk) blockers.push('account_info_api_failed');
  if (options.sendFileAssist && !sendOk) blockers.push('send_text_api_failed');
  if (options.requireVersionMatch && probe.versionStatus !== 'match') blockers.push(`wecom_version_${probe.versionStatus}`);
  if (!callbackLoopback) blockers.push('callback_host_not_loopback');
  if (!config.codexThreadId) warnings.push('codex_thread_id_missing');
  if (probe.versionStatus === 'mismatch' && !options.requireVersionMatch) warnings.push('wecom_version_mismatch');

  return {
    ok: blockers.length === 0,
    provider: probe.provider,
    providerApi: probe.providerApi,
    callbackEndpoint: `http://${config.callbackHost}:${config.callbackPort}/msg`,
    supportedWecomVersion: probe.supportedWecomVersion,
    installedWecomVersion: probe.installedWecomVersion,
    versionStatus: probe.versionStatus,
    capabilities: {
      localApi: loginOk || accountOk || Boolean(sendOk),
      loginStatus: loginOk,
      accountInfo: accountOk,
      receiveCallback: callbackLoopback,
      sendText: sendOk,
    },
    blockers,
    warnings,
    probe,
  };
}

async function runBridgeHealth(options = {}) {
  const config = buildConfig(options);
  const probe = await runVworkProbe(options);
  return bridgeContractFromProbe(probe, config, options);
}

async function main() {
  const result = await runBridgeHealth(parseArgs(process.argv));
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
  bridgeContractFromProbe,
  parseArgs,
  runBridgeHealth,
};
