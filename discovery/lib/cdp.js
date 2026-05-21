const http = require('http');
const WebSocket = require('ws');

const DEFAULT_BROWSER_URL = process.env.DISCOVERY_BROWSER_URL || 'http://127.0.0.1:9222';
const DEFAULT_CDP_READY_TIMEOUT_MS = Number(process.env.DISCOVERY_CDP_READY_TIMEOUT_MS || 10000);
const DEFAULT_CDP_SEND_TIMEOUT_MS = Number(process.env.DISCOVERY_CDP_SEND_TIMEOUT_MS || 30000);

function requestJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: options.method || 'GET', timeout: options.timeout || 5000 }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data || 'null'));
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error(`timeout requesting ${url}`));
    });
    req.end();
  });
}

async function listTabs(browserUrl = DEFAULT_BROWSER_URL) {
  return requestJson(`${browserUrl.replace(/\/$/, '')}/json/list`);
}

async function openTab(url, browserUrl = DEFAULT_BROWSER_URL) {
  const encoded = encodeURIComponent(url);
  try {
    return await requestJson(`${browserUrl.replace(/\/$/, '')}/json/new?${encoded}`, { method: 'PUT' });
  } catch (_) {
    return requestJson(`${browserUrl.replace(/\/$/, '')}/json/new?${encoded}`);
  }
}

function cdpSession(tab, options = {}) {
  if (!tab?.webSocketDebuggerUrl) throw new Error(`tab missing webSocketDebuggerUrl: ${tab?.url || '(unknown)'}`);
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  const readyTimeoutMs = Number(options.readyTimeoutMs || DEFAULT_CDP_READY_TIMEOUT_MS);
  const sendTimeoutMs = Number(options.sendTimeoutMs || DEFAULT_CDP_SEND_TIMEOUT_MS);
  let nextId = 1;
  const pending = new Map();
  const events = [];

  ws.on('message', data => {
    const msg = JSON.parse(data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject, timer } = pending.get(msg.id);
      pending.delete(msg.id);
      clearTimeout(timer);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result || {});
      return;
    }
    if (msg.method) events.push(msg);
  });

  function ready() {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`timeout opening CDP websocket after ${readyTimeoutMs}ms: ${tab.webSocketDebuggerUrl}`));
      }, readyTimeoutMs);
      const cleanup = () => {
        clearTimeout(timer);
        ws.off('open', onOpen);
        ws.off('error', onError);
      };
      const onOpen = () => {
        cleanup();
        resolve();
      };
      const onError = error => {
        cleanup();
        reject(error);
      };
      ws.once('open', onOpen);
      ws.once('error', onError);
    });
  }

  function send(method, params = {}) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`timeout sending ${method} after ${sendTimeoutMs}ms`));
      }, sendTimeoutMs);
      pending.set(id, { resolve, reject, timer });
      ws.send(JSON.stringify({ id, method, params }), error => {
        if (!error) return;
        const pendingItem = pending.get(id);
        if (pendingItem) {
          pending.delete(id);
          clearTimeout(pendingItem.timer);
        }
        reject(error);
      });
    });
  }

  function close() {
    for (const { timer, reject } of pending.values()) {
      clearTimeout(timer);
      reject(new Error('CDP session closed before response'));
    }
    pending.clear();
    try { ws.close(); } catch (_) {}
  }

  return { ready, send, events, close };
}

async function evaluate(tab, expression, awaitPromise = false) {
  const session = cdpSession(tab);
  await session.ready();
  try {
    const result = await session.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise,
    });
    return result.result?.value;
  } finally {
    session.close();
  }
}

module.exports = {
  DEFAULT_BROWSER_URL,
  listTabs,
  openTab,
  cdpSession,
  evaluate,
};
