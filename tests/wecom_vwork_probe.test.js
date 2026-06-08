const assert = require('assert');
const http = require('http');
const { assessVersion, runVworkProbe } = require('../scripts/run_wecom_vwork_probe');

function startMockVwork(port, seen) {
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
  const port = 19100;
  const server = await startMockVwork(port, seen);
  try {
    const result = await runVworkProbe({
      dllPort: port,
      sendFileAssist: 'probe message',
      provider: 'wechat-work-hook',
      installedVersion: '4.1.36.6012',
    });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.provider, 'wechat-work-hook');
    assert.strictEqual(result.supportedWecomVersion, '4.1.36.6012');
    assert.strictEqual(result.installedWecomVersion, '4.1.36.6012');
    assert.strictEqual(result.versionStatus, 'match');
    assert.ok(result.providerApi.includes(`:${port}/api`));
    assert.deepStrictEqual(result.checkedTypes, [1000, 1002, 3000]);
    assert.deepStrictEqual(seen.map(item => item.type), [1000, 1002, 3000]);
    assert.strictEqual(seen[2].user_id, 'FILEASSIST');
    assert.strictEqual(seen[2].msg, 'probe message');
  } finally {
    server.close();
  }

  assert.strictEqual(assessVersion({ supportedWecomVersion: '5.0.3.6005' }, '5.0.8.6009'), 'mismatch');
  assert.strictEqual(assessVersion({ supportedWecomVersion: '5.0.3.6005' }, '5.0.3.6005'), 'match');
  assert.strictEqual(assessVersion({ supportedWecomVersion: 'n/a' }, '5.0.8.6009'), 'unknown');

  const failed = await runVworkProbe({ dllPort: 19101, installedVersion: '5.0.8.6009' });
  assert.strictEqual(failed.ok, false);
  assert.strictEqual(failed.versionStatus, 'mismatch');
  assert.strictEqual(failed.checks[0].ok, false);
  assert.ok(failed.checks[0].error);

  console.log('wecom_vwork_probe tests passed');
})().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
