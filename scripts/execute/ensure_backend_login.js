const {
  TARGETS,
  allTargetsReady,
  classifyBackendPage,
  redactSensitiveUrl,
} = require('./backend_login_lib');
const {
  cdpSession,
  listTabs,
  openTab,
} = require('../../discovery/lib/cdp');

const PANEL_URL = 'chrome-extension://ipidenfkcdlhadnieamoocalimlnhagj/panel.html';
const DEFAULT_TIMEOUT_MS = Number(process.env.BACKEND_LOGIN_TIMEOUT_MS || 90000);
const POLL_MS = Number(process.env.BACKEND_LOGIN_POLL_MS || 1500);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function pageTabs(tabs) {
  return (tabs || []).filter(tab => tab.type === 'page');
}

function findTabForUrl(tabs, urlPrefix) {
  return pageTabs(tabs).find(tab => String(tab.url || '').startsWith(urlPrefix));
}

function findTabForTarget(tabs, target) {
  return pageTabs(tabs).find(tab => String(tab.url || '').startsWith(target.origin));
}

async function withSession(tab, fn) {
  const session = cdpSession(tab);
  await session.ready();
  try {
    return await fn(session);
  } finally {
    session.close();
  }
}

async function evaluate(tab, expression, awaitPromise = false) {
  return withSession(tab, async session => {
    const result = await session.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise,
    });
    if (result.exceptionDetails) {
      const message = result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'evaluation failed';
      throw new Error(message);
    }
    return result.result?.value;
  });
}

async function bringToFront(tab) {
  await withSession(tab, session => session.send('Page.bringToFront'));
}

async function ensureTab(url, predicate) {
  let tabs = await listTabs();
  let tab = predicate(tabs);
  if (tab) return tab;

  await openTab(url);
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    await sleep(500);
    tabs = await listTabs();
    tab = predicate(tabs);
    if (tab) return tab;
  }
  throw new Error(`required tab did not open: ${url}`);
}

async function readPageState(tab) {
  const state = await evaluate(tab, `(() => {
    const normalize = value => String(value || '').replace(/\\s+/g, ' ').trim();
    const frames = Array.from(document.querySelectorAll('iframe')).map(frame => {
      const rect = frame.getBoundingClientRect();
      return {
        src: frame.src || '',
        rect: {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        },
      };
    });
    return {
      href: location.href,
      title: document.title,
      text: normalize(document.body && document.body.innerText || '').slice(0, 2000),
      frames,
    };
  })()`);

  return {
    ...state,
    frames: (state.frames || []).map(frame => redactSensitiveUrl(frame.src || frame)),
    rawFrames: state.frames || [],
  };
}

function classifyWithState(target, state) {
  const pageState = {
    ...state,
    frames: state.rawFrames ? state.rawFrames.map(frame => frame.src || '') : state.frames,
  };
  return {
    ...classifyBackendPage(target, pageState),
    href: redactSensitiveUrl(state.href),
    title: state.title,
  };
}

async function clickInsideWeComFrame(target) {
  const tabs = await listTabs();
  const frame = (tabs || []).find(tab => {
    const url = String(tab.url || '');
    return tab.type === 'iframe' &&
      url.includes('login.work.weixin.qq.com') &&
      decodeURIComponent(url).includes(target.origin);
  });
  if (!frame) return { clicked: false, method: 'iframe_target_missing' };

  try {
    const result = await evaluate(frame, `(() => {
      const normalize = value => String(value || '').replace(/\\s+/g, ' ').trim();
      const keywords = ['继续在浏览器中登录访问', 'Log in and access in the browser'];
      const nodes = Array.from(document.querySelectorAll('a,button,span,div'));
      const hits = nodes
        .map(node => ({
          node,
          tag: String(node.tagName || '').toLowerCase(),
          text: normalize(node.innerText || node.textContent || ''),
        }))
        .filter(item => keywords.some(keyword => item.text.includes(keyword)))
        .sort((a, b) => {
          const aExact = keywords.includes(a.text) ? 0 : 1;
          const bExact = keywords.includes(b.text) ? 0 : 1;
          if (aExact !== bExact) return aExact - bExact;
          const aAnchor = a.tag === 'a' ? 0 : 1;
          const bAnchor = b.tag === 'a' ? 0 : 1;
          if (aAnchor !== bAnchor) return aAnchor - bAnchor;
          return a.text.length - b.text.length;
        });
      if (!hits.length) {
        return {
          clicked: false,
          method: 'iframe_dom',
          text: normalize(document.body && document.body.innerText || '').slice(0, 300),
        };
      }
      const hit = hits[0];
      hit.node.click();
      return {
        clicked: true,
        method: 'iframe_dom',
        tag: hit.tag,
        text: hit.text,
      };
    })()`);
    return result || { clicked: false, method: 'iframe_dom_empty_result' };
  } catch (error) {
    return { clicked: false, method: 'iframe_dom_error', error: error.message };
  }
}

async function clickByFrameCoordinate(tab, state) {
  const frame = (state.rawFrames || []).find(item => String(item.src || '').includes('login.work.weixin.qq.com'));
  const rect = frame?.rect || {};
  const x = Number.isFinite(rect.left) && Number.isFinite(rect.width)
    ? rect.left + rect.width / 2
    : 960;
  const y = Number.isFinite(rect.top) && Number.isFinite(rect.height)
    ? rect.top + rect.height * 0.79
    : 505;

  await withSession(tab, async session => {
    await session.send('Page.bringToFront');
    await session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
    await session.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await session.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  });
  return { clicked: true, method: 'parent_coordinate', x: Math.round(x), y: Math.round(y) };
}

async function clickBrowserAccess(target, tab, state, options = {}) {
  await bringToFront(tab);
  if (options.preferCoordinate) return clickByFrameCoordinate(tab, state);
  const iframeClick = await clickInsideWeComFrame(target);
  if (iframeClick.clicked) return iframeClick;
  const coordinateClick = await clickByFrameCoordinate(tab, state);
  return { ...coordinateClick, fallbackAfter: iframeClick };
}

async function waitForBackendReady(target, tab, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  const clickAttempts = [];
  let last = null;

  while (Date.now() < deadline) {
    const state = await readPageState(tab);
    const classified = classifyWithState(target, state);
    last = classified;

    if (classified.status === 'ready') {
      return { ...classified, clickAttempts };
    }

    if (classified.status === 'browser_login_available' && clickAttempts.length < 2) {
      const clicked = await clickBrowserAccess(target, tab, state, {
        preferCoordinate: clickAttempts.length > 0,
      });
      clickAttempts.push(clicked);
      await sleep(3000);
      continue;
    }

    if (classified.status === 'manual_login_required') {
      return { ...classified, clickAttempts };
    }

    await sleep(POLL_MS);
  }

  return {
    ...(last || { status: 'unknown', reason: 'timeout_without_state' }),
    status: 'timeout',
    reason: last?.reason || 'backend_not_ready_before_timeout',
    clickAttempts,
  };
}

async function ensureRequiredTabs() {
  const tabs = await listTabs();
  const adv = await ensureTab(TARGETS.adv.requiredUrl, items => findTabForTarget(items, TARGETS.adv));
  const inventory = await ensureTab(TARGETS.inventory.requiredUrl, items => findTabForTarget(items, TARGETS.inventory));
  const panel = await ensureTab(PANEL_URL, items => findTabForUrl(items, PANEL_URL));
  return { adv, inventory, panel, initialTabCount: tabs.length };
}

async function checkAdHealth(tab) {
  return evaluate(tab, `(async () => {
    const xsrf = document.cookie.match(/(?:^|;\\s*)XSRF-TOKEN=([^;]+)/)?.[1] || '';
    const payload = {
      siteId: 4,
      mode: 1,
      day: 7,
      userName: ['HJ17', 'HJ171', 'HJ172'],
      level: 'seller_num',
      field: 'cost',
      order: 'desc',
      page: 1,
      limit: 1,
    };
    const res = await fetch('/product/adSkuSummary', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'x-xsrf-token': decodeURIComponent(xsrf),
      },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_) {}
    const list = json?.data?.data || json?.data?.list || json?.data?.rows || json?.data || json?.list || json?.rows || [];
    return {
      ok: res.status === 200 && json?.code === 200 && Array.isArray(list),
      status: res.status,
      code: json?.code || null,
      msg: json?.msg || '',
      rowCount: Array.isArray(list) ? list.length : null,
      html: text.trimStart().startsWith('<'),
    };
  })()`, true);
}

async function checkInventoryHealth(panelTab) {
  async function runCheck(tab) {
    return evaluate(tab, `(async () => {
      try {
        const tab = await findTab('*://sellerinventory.yswg.com.cn/*');
        await ensureInventoryListPage(tab.id);
        return { ok: true };
      } catch (error) {
        return { ok: false, error: error.message || String(error) };
      }
    })()`, true);
  }

  let result = await runCheck(panelTab);
  if (result?.ok || !String(result?.error || '').includes('ensureInventoryListPage')) return result;

  await withSession(panelTab, session => session.send('Page.reload', { ignoreCache: true }));
  await sleep(2500);
  return runCheck(panelTab);
}

async function ensureBackendsReady() {
  const tabs = await ensureRequiredTabs();
  const statuses = {};

  statuses.adv = await waitForBackendReady(TARGETS.adv, tabs.adv);
  statuses.inventory = await waitForBackendReady(TARGETS.inventory, tabs.inventory);

  const health = {
    adv: statuses.adv.status === 'ready' ? await checkAdHealth(tabs.adv) : { ok: false, skipped: statuses.adv.status },
    inventory: statuses.inventory.status === 'ready' ? await checkInventoryHealth(tabs.panel) : { ok: false, skipped: statuses.inventory.status },
  };

  return {
    ok: allTargetsReady(statuses) && !!health.adv?.ok && !!health.inventory?.ok,
    statuses,
    health,
  };
}

async function main() {
  const result = await ensureBackendsReady();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = {
  ensureBackendsReady,
  readPageState,
  waitForBackendReady,
};
