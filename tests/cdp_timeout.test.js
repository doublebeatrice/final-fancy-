const assert = require('assert');
const { WebSocketServer } = require('ws');
const { clickAt, cdpSession, pageInfo, screenshot, scroll } = require('../discovery/lib/cdp');

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

function createCommandServer(handler) {
  const commands = [];
  return new Promise(resolve => {
    const server = new WebSocketServer({ port: 0 }, () => resolve({ server, commands }));
    server.on('connection', socket => {
      socket.on('message', data => {
        const msg = JSON.parse(data);
        commands.push(msg);
        const response = handler(msg, commands);
        if (response) socket.send(JSON.stringify({ id: msg.id, result: response }));
      });
    });
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

  {
    const { server: commandServer, commands } = await createCommandServer(msg => {
      if (msg.method !== 'Runtime.evaluate') return {};
      return { result: { value: { title: 'Example', url: 'https://example.com/', ready: 'complete' } } };
    });
    const port = commandServer.address().port;
    try {
      const info = await pageInfo(
        { webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/page/info` },
        { sendTimeoutMs: 200, readyTimeoutMs: 200 }
      );
      assert.deepStrictEqual(info, { title: 'Example', url: 'https://example.com/', ready: 'complete' });
      assert.strictEqual(commands[0].method, 'Runtime.evaluate');
      assert.match(commands[0].params.expression, /document\.title/);
    } finally {
      commandServer.close();
    }
  }

  {
    const { server: commandServer, commands } = await createCommandServer(msg => {
      if (msg.method === 'Runtime.evaluate') {
        return { result: { value: { x: 10, y: 20, tag: 'BUTTON', text: 'Upload' } } };
      }
      return {};
    });
    const port = commandServer.address().port;
    try {
      const result = await clickAt(
        { webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/page/click` },
        'button.upload',
        { sendTimeoutMs: 200, readyTimeoutMs: 200 }
      );
      assert.strictEqual(result.clicked, true);
      assert.deepStrictEqual(
        commands.map(command => command.method),
        [
          'Runtime.evaluate',
          'Input.dispatchMouseEvent',
          'Input.dispatchMouseEvent',
          'Input.dispatchMouseEvent',
        ]
      );
      assert.strictEqual(commands[2].params.type, 'mousePressed');
      assert.strictEqual(commands[2].params.x, 10);
      assert.strictEqual(commands[2].params.y, 20);
    } finally {
      commandServer.close();
    }
  }

  {
    const { server: commandServer, commands } = await createCommandServer(msg => {
      if (msg.method === 'Runtime.evaluate') return { result: { value: 'scrolled to bottom' } };
      return {};
    });
    const port = commandServer.address().port;
    try {
      const result = await scroll(
        { webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/page/scroll` },
        { direction: 'bottom', sendTimeoutMs: 200, readyTimeoutMs: 200 }
      );
      assert.strictEqual(result, 'scrolled to bottom');
      assert.match(commands[0].params.expression, /document\.body\.scrollHeight/);
    } finally {
      commandServer.close();
    }
  }

  {
    const { server: commandServer, commands } = await createCommandServer(msg => {
      if (msg.method === 'Page.captureScreenshot') {
        return { data: Buffer.from('png-bytes').toString('base64') };
      }
      return {};
    });
    const port = commandServer.address().port;
    try {
      const result = await screenshot(
        { webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/page/screenshot` },
        { sendTimeoutMs: 200, readyTimeoutMs: 200 }
      );
      assert.ok(Buffer.isBuffer(result));
      assert.strictEqual(result.toString(), 'png-bytes');
      assert.strictEqual(commands[0].method, 'Page.captureScreenshot');
      assert.strictEqual(commands[0].params.format, 'png');
    } finally {
      commandServer.close();
    }
  }

  console.log('cdp_timeout tests passed');
})().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
