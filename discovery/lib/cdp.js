const http = require('http');
const fs = require('fs');
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

function requestText(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: options.method || 'GET', timeout: options.timeout || 5000 }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error(`timeout requesting ${url}`));
    });
    req.end();
  });
}

function baseUrl(browserUrl = DEFAULT_BROWSER_URL) {
  return browserUrl.replace(/\/$/, '');
}

async function listTabs(browserUrl = DEFAULT_BROWSER_URL) {
  return requestJson(`${baseUrl(browserUrl)}/json/list`);
}

async function browserWebSocketUrl(browserUrl = DEFAULT_BROWSER_URL) {
  const version = await requestJson(`${baseUrl(browserUrl)}/json/version`);
  return version.webSocketDebuggerUrl;
}

async function waitForTab(targetId, browserUrl = DEFAULT_BROWSER_URL, timeoutMs = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const tabs = await listTabs(browserUrl);
    const tab = (tabs || []).find(item => item.id === targetId);
    if (tab?.webSocketDebuggerUrl) return tab;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return null;
}

async function openTab(url, browserUrl = DEFAULT_BROWSER_URL, options = {}) {
  const background = options.background !== false;
  if (background) {
    let session;
    try {
      session = cdpSession({ webSocketDebuggerUrl: await browserWebSocketUrl(browserUrl), url: 'browser' });
      await session.ready();
      const result = await session.send('Target.createTarget', { url, background: true });
      const tab = await waitForTab(result.targetId, browserUrl);
      if (tab) return tab;
    } catch (_) {
      // Fall back to the HTTP endpoint below. Some Chrome builds may reject background targets.
    } finally {
      if (session) session.close();
    }
  }

  const encoded = encodeURIComponent(url);
  try {
    return await requestJson(`${baseUrl(browserUrl)}/json/new?${encoded}`, { method: 'PUT' });
  } catch (_) {
    return requestJson(`${baseUrl(browserUrl)}/json/new?${encoded}`);
  }
}

async function closeTab(tab, browserUrl = DEFAULT_BROWSER_URL) {
  if (!tab?.id) return false;
  try {
    await requestText(`${baseUrl(browserUrl)}/json/close/${encodeURIComponent(tab.id)}`);
    return true;
  } catch (_) {
    let session;
    try {
      session = cdpSession({ webSocketDebuggerUrl: await browserWebSocketUrl(browserUrl), url: 'browser' });
      await session.ready();
      await session.send('Target.closeTarget', { targetId: tab.id });
      return true;
    } catch (_) {
      return false;
    } finally {
      if (session) session.close();
    }
  }
}

async function navigate(tab, url, options = {}) {
  return withSession(tab, async session => {
    await session.send('Page.navigate', { url });
  }, options);
}

async function withSession(tab, fn, options = {}) {
  const session = cdpSession(tab, options);
  await session.ready();
  try {
    return await fn(session);
  } finally {
    session.close();
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

async function evaluate(tab, expression, awaitPromise = false, options = {}) {
  return withSession(tab, async session => {
    const result = await session.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise,
    });
    return result.result?.value;
  }, options);
}

async function pageInfo(tab, options = {}) {
  return evaluate(tab, `(() => ({
    title: document.title,
    url: location.href,
    ready: document.readyState
  }))()`, false, options);
}

async function scroll(tab, options = {}) {
  const y = Number.isFinite(Number(options.y)) ? Math.abs(Number(options.y)) : 3000;
  const direction = options.direction || 'down';
  let expression;
  if (direction === 'top') {
    expression = 'window.scrollTo(0, 0); "scrolled to top"';
  } else if (direction === 'bottom') {
    expression = 'window.scrollTo(0, document.body.scrollHeight); "scrolled to bottom"';
  } else if (direction === 'up') {
    expression = `window.scrollBy(0, -${y}); "scrolled up ${y}px"`;
  } else {
    expression = `window.scrollBy(0, ${y}); "scrolled down ${y}px"`;
  }
  return evaluate(tab, expression, false, options);
}

async function clickAt(tab, selector, options = {}) {
  if (!selector) throw new Error('clickAt requires a CSS selector');
  return withSession(tab, async session => {
    const selectorJson = JSON.stringify(selector);
    const coordResult = await session.send('Runtime.evaluate', {
      expression: `(() => {
        const el = document.querySelector(${selectorJson});
        if (!el) return { error: 'element not found: ' + ${selectorJson} };
        el.scrollIntoView({ block: 'center', inline: 'center' });
        const rect = el.getBoundingClientRect();
        return {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
          tag: el.tagName,
          text: String(el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 120)
        };
      })()`,
      returnByValue: true,
      awaitPromise: true,
    });
    const coord = coordResult.result?.value;
    if (!coord || coord.error) throw new Error(coord?.error || `unable to locate element: ${selector}`);

    const button = options.button || 'left';
    const clickCount = Number(options.clickCount || 1);
    await session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: coord.x, y: coord.y, button: 'none' });
    await session.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: coord.x, y: coord.y, button, clickCount });
    await session.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: coord.x, y: coord.y, button, clickCount });
    return { clicked: true, ...coord };
  }, options);
}

async function screenshot(tab, options = {}) {
  return withSession(tab, async session => {
    const format = options.format || 'png';
    const params = { format };
    if (format === 'jpeg' && options.quality) params.quality = options.quality;
    if (options.clip) params.clip = options.clip;
    if (Object.prototype.hasOwnProperty.call(options, 'captureBeyondViewport')) {
      params.captureBeyondViewport = options.captureBeyondViewport;
    }
    const result = await session.send('Page.captureScreenshot', params);
    const buffer = Buffer.from(result.data || '', 'base64');
    if (options.file) {
      fs.writeFileSync(options.file, buffer);
      return { file: options.file, bytes: buffer.length, format };
    }
    return buffer;
  }, options);
}

module.exports = {
  DEFAULT_BROWSER_URL,
  listTabs,
  openTab,
  closeTab,
  cdpSession,
  clickAt,
  evaluate,
  navigate,
  pageInfo,
  screenshot,
  scroll,
  withSession,
};
