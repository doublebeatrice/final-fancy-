const {
  DEFAULT_CONFIG,
  buildDigest,
  loadConfig,
  writeDigest,
} = require('../src/wecom_gateway');

function parseArgs(argv) {
  const args = argv.slice(2);
  const get = name => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : '';
  };
  return {
    configFile: get('--config') || process.env.WECOM_GATEWAY_CONFIG || '',
    today: get('--today') || process.env.WECOM_DIGEST_TODAY || '',
    slot: get('--slot') || process.env.WECOM_DIGEST_SLOT || '',
    outDir: get('--out-dir') || process.env.WECOM_OUT_DIR || '',
    outFile: get('--out') || process.env.WECOM_DIGEST_OUT || '',
    promptOut: get('--prompt-out') || process.env.WECOM_PROMPT_OUT || '',
    threadId: get('--thread-id') || process.env.CODEX_REVIEW_THREAD_ID || '',
  };
}

function runWecomDigest(options = {}) {
  const config = {
    ...DEFAULT_CONFIG,
    ...loadConfig(options.configFile),
    ...(options.outDir ? { outDir: options.outDir } : {}),
    ...(options.threadId ? { codexThreadId: options.threadId } : {}),
  };
  const digest = buildDigest({
    config,
    today: options.today,
    slot: options.slot,
    outDir: config.outDir,
    codexThreadId: config.codexThreadId,
  });
  const files = writeDigest(digest, {
    outDir: config.outDir,
    outFile: options.outFile,
    promptOut: options.promptOut,
  });
  return { digest, files };
}

function main() {
  const options = parseArgs(process.argv);
  const { digest, files } = runWecomDigest(options);
  console.log(JSON.stringify({
    ok: true,
    businessDate: digest.businessDate,
    slot: digest.slot,
    codexThreadId: digest.codexThreadId,
    summary: digest.summary,
    files,
    note: 'Use the generated prompt file as the Codex thread message payload.',
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
  parseArgs,
  runWecomDigest,
};
