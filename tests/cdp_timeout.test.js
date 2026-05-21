const assert = require('assert');
const { WebSocketServer } = require('ws');
const { cdpSession } = require('../discovery/lib/cdp');

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    wait(ms).then(() => {
      throw new Error(message);
    }),
  ]);
}

function createServer(handler) {
  return new Promise(resolve => {
    const server = new WebSocketServer({ port: 0 }, () => resolve(server));
    server.on('connection', handler);
  });
}

(async () => {
  const server = await createServer(socket => {
    socket.on('message', () => {
      // Intentionally do not reply; this simulates a stuck DevTools page.
    });
  });
  const port = server.address().port;
  const session = cdpSession(
    { webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/page/test` },
    { sendTimeoutMs: 40, readyTimeoutMs: 40 }
  );

  try {
    await session.ready();
    const error = await withTimeout(
      session.send('Runtime.evaluate', {}).then(
        () => null,
        err => err
      ),
      300,
      'test timed out waiting for CDP send timeout'
    );
    assert.ok(error instanceof Error);
    assert.match(error.message, /timeout sending Runtime\.evaluate/);
  } finally {
    session.close();
    server.close();
  }

  console.log('cdp_timeout tests passed');
})().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
