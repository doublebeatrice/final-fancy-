const {
  DEFAULT_CONFIG,
  cleanupWecomFiles,
  loadConfig,
} = require('../src/wecom_gateway');

function parseArgs(argv) {
  const args = argv.slice(2);
  const get = name => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : '';
  };
  return {
    configFile: get('--config') || process.env.WECOM_GATEWAY_CONFIG || '',
    today: get('--today') || process.env.WECOM_CLEANUP_TODAY || '',
    outDir: get('--out-dir') || process.env.WECOM_OUT_DIR || '',
    retentionDays: get('--retention-days') || process.env.WECOM_RETENTION_DAYS || '',
  };
}

function runWecomCleanup(options = {}) {
  const config = {
    ...DEFAULT_CONFIG,
    ...loadConfig(options.configFile),
    ...(options.outDir ? { outDir: options.outDir } : {}),
    ...(options.retentionDays ? { retentionDays: Number(options.retentionDays) } : {}),
  };
  return cleanupWecomFiles({
    outDir: config.outDir,
    retentionDays: config.retentionDays,
    today: options.today,
    timezone: config.timezone,
  });
}

function main() {
  const options = parseArgs(process.argv);
  const result = runWecomCleanup(options);
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
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
  parseArgs,
  runWecomCleanup,
};
