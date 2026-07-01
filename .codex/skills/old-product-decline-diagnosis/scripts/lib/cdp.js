'use strict';

/**
 * 轻量 CDP 连接库（自包含）
 * 通过 Chrome DevTools Protocol 连接调试浏览器，执行页面内 JS 表达式。
 */

const http = require('http');

const CDP_URL = process.env.CDP_URL || 'http://127.0.0.1:9222';

function requestJson(url, timeout = 5000) {
  return new Promise((resolve, reject) => {
    http.get(url, { timeout }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data || 'null')); }
        catch (e) { reject(new Error(`JSON parse error from ${url}`)); }
      });
    }).on('error', reject).on('timeout', function () { this.destroy(new Error('timeout')); });
  });
}

async function isChromeReady() {
  try {
    await requestJson(`${CDP_URL}/json/version`);
    return true;
  } catch (_) {
    return false;
  }
}

async function listTabs() {
  try {
    return await requestJson(`${CDP_URL}/json/list`) || [];
  } catch (_) {
    return [];
  }
}

async function findTab(urlPattern) {
  const tabs = await listTabs();
  return tabs.find(t => t.url && t.url.includes(urlPattern) && t.webSocketDebuggerUrl);
}

async function evaluate(tab, expression, awaitPromise = true, timeout = 60000) {
  let WebSocket;
  try {
    WebSocket = require('ws');
  } catch (_) {
    throw new Error('缺少 ws 依赖，请在 skill 目录下运行：npm install ws');
  }

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    const timer = setTimeout(() => { ws.close(); reject(new Error('CDP evaluate 超时')); }, timeout);

    ws.on('open', () => {
      ws.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: { expression, returnByValue: true, awaitPromise },
      }));
    });
    ws.on('message', raw => {
      const msg = JSON.parse(raw);
      if (msg.id === 1) {
        clearTimeout(timer);
        ws.close();
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else if (msg.result?.exceptionDetails) {
          reject(new Error(msg.result.exceptionDetails.text || msg.result.exceptionDetails.exception?.description || 'evaluate error'));
        }
        else resolve(msg.result?.result?.value);
      }
    });
    ws.on('error', e => { clearTimeout(timer); reject(e); });
  });
}

async function openNewTab(url) {
  try {
    return await requestJson(`${CDP_URL}/json/new?${encodeURIComponent(url)}`);
  } catch (_) {
    return null;
  }
}

async function listAllTargets() {
  try {
    return await requestJson(`${CDP_URL}/json/list`) || [];
  } catch (_) {
    return [];
  }
}

module.exports = { isChromeReady, listTabs, findTab, evaluate, openNewTab, listAllTargets, CDP_URL };
