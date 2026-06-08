const assert = require('assert');
const http = require('http');
const {
  bridgeContractFromProbe,
  runBridgeHealth,
} = require('../scripts/run_wecom_bridge_health');

function startMockProvider(port, seen) {
  const server = http.createServer((req, res) => {
    assert.strictEqual(req.method, 'POST');
    assert.strictEqual(req.url, '/api');
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      seen.push(body);
      const payload = body.type === 1000
        ? { data: { status: true } }
        : (body.type === 1002 ? { data: { user_id: 'self' } } : { data: { sent: true } });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload));
    });
  });
  return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve(server)));
}

(async () => {
  const seen = [];
  const port = 19120;
  const server = await startMockProvider(port, seen);
  try {
    const result = await runBridgeHealth({
      dllPort: port,
      provider: 'wechat-work-hook',
      installedVersion: '4.1.36.6012',
      requireVersionMatch: true,
      sendFileAssist: 'bridge health',
    });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.provider, 'wechat-work-hook');
    assert.strictEqual(result.versionStatus, 'match');
    assert.strictEqual(result.capabilities.loginStatus, true);
    assert.strictEqual(result.capabilities.accountInfo, true);
    assert.strictEqual(result.capabilities.receiveCallback, true);
    assert.strictEqual(result.capabilities.sendText, true);
    assert.deepStrictEqual(seen.map(item => item.type), [1000, 1002, 3000]);
  } finally {
    server.close();
  }

  const mismatch = bridgeContractFromProbe({
    provider: 'vworkApi',
    providerApi: 'http://127.0.0.1:8989/api',
    supportedWecomVersion: '5.0.3.6005',
    installedWecomVersion: '5.0.8.6009',
    versionStatus: 'mismatch',
    checks: [
      { label: 'login_status:type_1000', ok: true },
      { label: 'account_info:type_1002', ok: true },
    ],
  }, {
    callbackHost: '127.0.0.1',
    callbackPort: 9000,
    codexThreadId: '',
  }, {
    requireVersionMatch: true,
  });
  assert.strictEqual(mismatch.ok, false);
  assert.ok(mismatch.blockers.includes('wecom_version_mismatch'));
  assert.ok(mismatch.warnings.includes('codex_thread_id_missing'));

  console.log('wecom_bridge_health tests passed');
})().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
