const http = require('http');
const WebSocket = require('ws');

const DEFAULT_BROWSER_URL = process.env.DISCOVERY_BROWSER_URL || 'http://127.0.0.1:9222';

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

function cdpSession(tab) {
  if (!tab?.webSocketDebuggerUrl) throw new Error(`tab missing webSocketDebuggerUrl: ${tab?.url || '(unknown)'}`);
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let nextId = 1;
  const pending = new Map();
  const events = [];

  ws.on('message', data => {
    const msg = JSON.parse(data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result || {});
      return;
    }
    if (msg.method) events.push(msg);
  });

  function ready() {
    return new Promise(resolve => ws.on('open', resolve));
  }

  function send(method, params = {}) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  function close() {
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
