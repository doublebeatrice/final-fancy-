const {
  DEFAULT_CONFIG,
  loadConfig,
  queryVworkApi,
  startGateway,
} = require('../src/wecom_gateway');

function parseArgs(argv) {
  const args = argv.slice(2);
  const get = name => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : '';
  };
  return {
    configFile: get('--config') || process.env.WECOM_GATEWAY_CONFIG || '',
    callbackPort: get('--callback-port') || process.env.WECOM_CALLBACK_PORT || '',
    apiPort: get('--api-port') || process.env.WECOM_API_PORT || '',
    dllPort: get('--dll-port') || process.env.WECOM_DLL_PORT || '',
    outDir: get('--out-dir') || process.env.WECOM_OUT_DIR || '',
    health: args.includes('--health'),
  };
}

async function runHealth(config) {
  const login = await queryVworkApi({ type: 1000 }, config);
  const account = await queryVworkApi({ type: 1002 }, config);
  return { ok: true, login, account };
}

async function main() {
  const options = parseArgs(process.argv);
  const config = {
    ...DEFAULT_CONFIG,
    ...loadConfig(options.configFile),
    ...(options.callbackPort ? { callbackPort: Number(options.callbackPort) } : {}),
    ...(options.apiPort ? { apiPort: Number(options.apiPort), dllPort: Number(options.apiPort) } : {}),
    ...(options.dllPort ? { apiPort: Number(options.dllPort), dllPort: Number(options.dllPort) } : {}),
    ...(options.outDir ? { outDir: options.outDir } : {}),
  };
  if (options.health) {
    console.log(JSON.stringify(await runHealth(config), null, 2));
    return;
  }
  startGateway({ config });
  console.log(JSON.stringify({
    ok: true,
    service: 'wecom_gateway',
    provider: config.provider,
    callback: `http://${config.callbackHost}:${config.callbackPort}/msg`,
    outDir: config.outDir,
    providerApi: `http://${config.apiHost}:${config.apiPort}${config.apiPath}`,
  }, null, 2));
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
  runHealth,
};
