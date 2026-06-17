const assert = require('assert');
const {
  parseArgs,
  waitForComplete,
} = require('../scripts/execute/probe_web_page_cdp');

async function run() {
  const args = parseArgs([
    'https://example.com',
    '--screenshot',
    'out.png',
    '--keep-tab',
    '--browser-url',
    'http://127.0.0.1:9222',
  ]);

  assert.deepStrictEqual(args, {
    url: 'https://example.com',
    screenshotFile: 'out.png',
    keepTab: true,
    browserUrl: 'http://127.0.0.1:9222',
  });

  const calls = [];
  const tab = { id: 'tab-1' };
  const info = await waitForComplete(tab, 1000, {
    pageInfo: async value => {
      calls.push(value);
      return calls.length === 1 ? { ready: 'loading' } : { ready: 'complete' };
    },
    sleep: async () => {},
    now: () => calls.length * 250,
  });

  assert.strictEqual(info.ready, 'complete');
  assert.deepStrictEqual(calls, [tab, tab]);

  let now = 0;
  const timeoutInfo = await waitForComplete({}, 500, {
    pageInfo: async () => ({ ready: 'loading' }),
    sleep: async () => { now += 250; },
    now: () => now,
  });

  assert.strictEqual(timeoutInfo.ready, 'loading');

  console.log('probe_web_page_cdp tests passed');
}

run().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
