const path = require('path');
const {
  closeTab,
  openTab,
  pageInfo,
  screenshot,
} = require('../../discovery/lib/cdp');

function parseArgs(argv) {
  const args = { url: '', screenshotFile: '', keepTab: false, browserUrl: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === '--screenshot') args.screenshotFile = argv[++i] || '';
    else if (value === '--keep-tab') args.keepTab = true;
    else if (value === '--browser-url') args.browserUrl = argv[++i] || '';
    else if (!args.url) args.url = value;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.url) {
    throw new Error('Usage: node scripts/execute/probe_web_page_cdp.js <url> [--screenshot <file>] [--keep-tab]');
  }

  const tab = await openTab(args.url, args.browserUrl || undefined, { background: true });
  try {
    await waitForComplete(tab, 5000).catch(() => {});
    const info = await pageInfo(tab);
    const result = { ...info, tabId: tab.id || null };
    if (args.screenshotFile) {
      const out = path.resolve(args.screenshotFile);
      result.screenshot = await screenshot(tab, { file: out });
    }
    console.log(JSON.stringify(result, null, 2));
  } finally {
    if (!args.keepTab) await closeTab(tab, args.browserUrl || undefined);
  }
}

async function waitForComplete(tab, timeoutMs, deps = {}) {
  const getPageInfo = deps.pageInfo || pageInfo;
  const sleep = deps.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const now = deps.now || Date.now;
  const started = now();
  while (now() - started < timeoutMs) {
    const info = await getPageInfo(tab);
    if (info.ready === 'complete') return info;
    await sleep(250);
  }
  return getPageInfo(tab);
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
  waitForComplete,
};
