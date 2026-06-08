const {
  TARGETS,
  allTargetsReady,
  classifyBackendPage,
  parseSelectionAccessToken,
  redactSensitiveUrl,
} = require('./backend_login_lib');
const {
  DEFAULT_BROWSER_URL,
  cdpSession,
  closeTab,
  listTabs,
  openTab,
} = require('../../discovery/lib/cdp');

const LEGACY_PANEL_URL = 'chrome-extension://ipidenfkcdlhadnieamoocalimlnhagj/panel.html';
const DEFAULT_TIMEOUT_MS = Number(process.env.BACKEND_LOGIN_TIMEOUT_MS || 90000);
const POLL_MS = Number(process.env.BACKEND_LOGIN_POLL_MS || 1500);
const REQUIRE_PANEL = process.env.AD_OPS_REQUIRE_PANEL === '1';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function pageTabs(tabs) {
  return (tabs || []).filter(tab => tab.type === 'page');
}

function findTabForUrl(tabs, urlPrefix) {
  return pageTabs(tabs).find(tab => String(tab.url || '').startsWith(urlPrefix));
}

function isPanelUrl(url) {
  return /^chrome-extension:\/\/[a-p]{32}\/panel\.html(?:[?#].*)?$/.test(String(url || ''));
}

function panelUrlForExtensionUrl(url) {
  const match = String(url || '').match(/^chrome-extension:\/\/([a-p]{32})\//);
  return match ? `chrome-extension://${match[1]}/panel.html` : '';
}

function uniqueValues(values) {
  return [...new Set(values.filter(value => typeof value === 'string' && value.trim()))];
}

async function listBrowserTargets(browserUrl = DEFAULT_BROWSER_URL) {
  const response = await fetch(`${browserUrl.replace(/\/$/, '')}/json/version`);
  const version = await response.json();
  if (!version.webSocketDebuggerUrl) return [];

  const session = cdpSession({ webSocketDebuggerUrl: version.webSocketDebuggerUrl, url: 'browser' });
  await session.ready();
  try {
    const result = await session.send('Target.getTargets');
    return result.targetInfos || [];
  } finally {
    session.close();
  }
}

async function discoverPanelCandidateUrls(tabs = null) {
  const candidates = [];
  if (process.env.AD_OPS_PANEL_URL) candidates.push(process.env.AD_OPS_PANEL_URL);

  const currentTabs = tabs || await listTabs();
  for (const tab of pageTabs(currentTabs)) {
    if (isPanelUrl(tab.url)) candidates.push(tab.url);
    if (isPanelUrl(tab.title)) candidates.push(tab.title);
  }

  try {
    const targets = await listBrowserTargets();
    for (const target of targets) {
      const url = panelUrlForExtensionUrl(target.url);
      if (url) candidates.push(url);
    }
  } catch (_) {
    // Existing page targets and an explicit URL are enough for the safe path.
  }

  if (process.env.AD_OPS_USE_LEGACY_PANEL_URL === '1') candidates.push(LEGACY_PANEL_URL);
  return uniqueValues(candidates);
}

function findTabForTarget(tabs, target) {
  const matches = pageTabs(tabs).filter(tab => String(tab.url || '').startsWith(target.origin));
  matches.sort((a, b) => targetTabScore(a, target) - targetTabScore(b, target));
  return matches[0];
}

function targetTabScore(tab, target) {
  const url = String(tab.url || '');
  if (target.key === 'adv' && /^https:\/\/adv\.yswg\.com\.cn\/vue\/?\?/.test(url)) return 0;
  if (url === target.requiredUrl || url === `${target.origin}/`) return 1;
  if (!url.includes(target.loginPath)) return 2;
  return 3;
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
  const selection = await ensureTab(TARGETS.selection.requiredUrl, items => findTabForTarget(items, TARGETS.selection));
  const sif = await ensureTab(TARGETS.sif.requiredUrl, items => findTabForTarget(items, TARGETS.sif));
  const panel = await ensurePanelTab(tabs);
  return { adv, inventory, selection, sif, panel: panel.tab, panelDiagnostics: panel, initialTabCount: tabs.length };
}

function workflowTabKey(tab) {
  const url = String(tab.url || '');
  if (isPanelUrl(url)) return 'panel';
  for (const [key, target] of Object.entries(TARGETS)) {
    if (url.startsWith(target.origin)) return key;
  }
  if (url === 'about:blank') return 'blank';
  return null;
}

async function closeDuplicateWorkflowTabs(keepTabs) {
  const keepIds = new Set(
    Object.values(keepTabs || {})
      .map(tab => tab && tab.id)
      .filter(Boolean)
  );
  const tabs = pageTabs(await listTabs());
  const closed = [];

  for (const key of ['adv', 'inventory', 'selection', 'sif', 'panel']) {
    const matches = tabs.filter(tab => workflowTabKey(tab) === key);
    const keep = matches.find(tab => keepIds.has(tab.id)) || matches[0];
    for (const tab of matches) {
      if (!keep || tab.id === keep.id) continue;
      if (await closeTab(tab)) closed.push({ key, id: tab.id, url: tab.url });
    }
  }

  for (const tab of tabs.filter(item => workflowTabKey(item) === 'blank')) {
    if (await closeTab(tab)) closed.push({ key: 'blank', id: tab.id, url: tab.url });
  }

  return closed;
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

async function checkInventoryHealth(panelTab, inventoryTab) {
  async function runDirectPageCheck(tab) {
    if (!tab) return { ok: false, error: 'inventory tab missing for direct health fallback' };
    const state = await readPageState(tab);
    const classified = classifyWithState(TARGETS.inventory, state);
    return {
      ok: classified.status === 'ready',
      status: classified.status,
      reason: classified.reason,
      href: classified.href,
      title: classified.title,
      fallback: 'inventory_page_state',
    };
  }

  if (!panelTab) return runDirectPageCheck(inventoryTab);

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
  if (result?.ok) return result;
  const panelError = String(result?.error || '');
  if (!panelError.includes('ensureInventoryListPage') && !panelError.includes('findTab')) return result;

  await withSession(panelTab, session => session.send('Page.reload', { ignoreCache: true }));
  await sleep(2500);
  result = await runCheck(panelTab);
  if (result?.ok) return result;
  const retryError = String(result?.error || '');
  if (retryError.includes('ensureInventoryListPage') || retryError.includes('findTab')) {
    return runDirectPageCheck(inventoryTab);
  }
  return result;
}

async function checkPanelHealth(tab) {
  if (!tab) {
    return { ok: false, error: 'project extension panel tab missing', blocked: false, missingFunctions: [] };
  }

  return evaluate(tab, `(() => {
    const required = [
      'findTab',
      'fetchAllData',
      'fetchSevenDayUntouchedPools',
      'ensureInventoryListPage',
      'fetchAllInventoryDirect',
    ];
    const functions = {};
    for (const name of required) functions[name] = typeof globalThis[name];
    const missingFunctions = required.filter(name => functions[name] !== 'function');
    const href = location.href;
    const bodyText = String(document.body && document.body.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 500);
    const blocked = href.startsWith('chrome-error://') || /blocked|ERR_BLOCKED_BY_CLIENT/i.test(bodyText);
    return {
      ok: !blocked && missingFunctions.length === 0,
      href,
      title: document.title,
      blocked,
      missingFunctions,
      functions,
      bodyText,
    };
  })()`);
}

async function ensurePanelTab(initialTabs = null) {
  const candidates = await discoverPanelCandidateUrls(initialTabs);
  const failed = [];

  for (const url of candidates) {
    let tab = null;
    try {
      tab = await ensureTab(url, items => findTabForUrl(items, url));
      const health = await checkPanelHealth(tab);
      if (health?.ok) return { tab, url, health, candidates, failed };

      failed.push({ url, health });
      if (health?.blocked) await closeTab(tab);
    } catch (error) {
      failed.push({ url, error: error.message || String(error) });
      if (tab) await closeTab(tab);
    }
  }

  return {
    tab: null,
    url: candidates[0] || null,
    health: {
      ok: false,
      error: 'no usable project extension panel found',
      blocked: failed.some(item => item.health?.blocked),
      missingFunctions: [],
    },
    candidates,
    failed,
  };
}

async function checkSelectionHealth(tab) {
  return evaluate(tab, `(async () => {
    const parseToken = rawValue => {
      if (!rawValue) return '';
      try {
        const parsed = JSON.parse(String(rawValue));
        return typeof parsed?.value === 'string' ? parsed.value : '';
      } catch (_) {
        return '';
      }
    };
    const rawToken = localStorage.getItem('pro__Access-Token') || '';
    const accessToken = parseToken(rawToken);
    const tokenState = {
      hasAccessToken: !!accessToken,
      tokenLength: accessToken ? String(accessToken).length : 0,
    };
    const resultKeys = new Set();
    const readJson = async path => {
      const headers = { accept: 'application/json, text/plain, */*' };
      if (accessToken) headers['X-Access-Token'] = accessToken;
      const res = await fetch(path, { credentials: 'include', headers });
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch (_) {}
      if (json?.result && typeof json.result === 'object' && !Array.isArray(json.result)) {
        Object.keys(json.result).forEach(key => resultKeys.add(key));
      }
      return {
        status: res.status,
        isJson: !!json,
        success: json?.success ?? null,
        code: json?.code ?? null,
        message: String(json?.message || json?.msg || '').slice(0, 120),
      };
    };

    if (!accessToken) {
      return {
        ok: false,
        status: null,
        code: null,
        success: false,
        message: 'selection access token missing',
        resultKeys: [],
        ...tokenState,
      };
    }

    const checks = [
      await readJson('/soundasia_selection/analysis/index/getSeasonDate'),
      await readJson('/soundasia_selection/analysis/index/getHeadData?site=1'),
    ];
    const failed = checks.find(item => item.status !== 200 || item.code !== 200 || item.success !== true || !item.isJson);
    if (failed) {
      return {
        ok: false,
        status: failed.status,
        code: failed.code,
        success: failed.success,
        message: failed.message || 'selection health check failed',
        resultKeys: [...resultKeys].slice(0, 40),
        ...tokenState,
      };
    }

    const last = checks[checks.length - 1] || {};
    return {
      ok: true,
      status: last.status,
      code: last.code,
      success: last.success,
      message: 'ok',
      resultKeys: [...resultKeys].slice(0, 40),
      ...tokenState,
    };
  })()`, true);
}

async function checkSifHealth(tab) {
  return evaluate(tab, `(async () => {
    const readCookie = name => {
      const hit = document.cookie.split(';').map(item => item.trim()).find(item => item.startsWith(name + '='));
      return hit ? hit.slice(name.length + 1) : '';
    };
    const token = localStorage.getItem('token') || readCookie('sif_token_share_prod') || readCookie('sif_token') || '';
    const tokenState = {
      hasToken: !!token,
      tokenLength: token ? String(token).length : 0,
    };
    if (token && !localStorage.getItem('token')) localStorage.setItem('token', token);
    if (!token) {
      return {
        ok: false,
        status: null,
        code: null,
        message: 'SIF token missing',
        ...tokenState,
      };
    }

    const url = '/api/search/keyword/abahistory/chart?country=US&keyword=party%20favors&granularity=week&_t=' + Date.now();
    const res = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers: {
        accept: 'application/json, text/plain, */*',
        authorization: token,
      },
    });
    const bodyText = await res.text();
    let json = null;
    try { json = JSON.parse(bodyText); } catch (_) {}
    const data = json?.data || json?.result || {};
    return {
      ok: res.status === 200 && json?.code === 1 && Array.isArray(data.granularities),
      status: res.status,
      code: json?.code ?? null,
      message: String(json?.message || json?.msg || '').slice(0, 120),
      resultKeys: data && typeof data === 'object' ? Object.keys(data).slice(0, 40) : [],
      timelineCount: Array.isArray(data.granularities) ? data.granularities.length : 0,
      latestSearchVolume: Array.isArray(data.keywordSearchVolumes) && data.keywordSearchVolumes.length
        ? Number(data.keywordSearchVolumes[data.keywordSearchVolumes.length - 1])
        : null,
      html: bodyText.trimStart().startsWith('<'),
      ...tokenState,
    };
  })()`, true);
}

async function ensureBackendsReady() {
  const tabs = await ensureRequiredTabs();
  const duplicateTabsClosed = await closeDuplicateWorkflowTabs(tabs);
  const statuses = {};

  statuses.adv = await waitForBackendReady(TARGETS.adv, tabs.adv);
  statuses.inventory = await waitForBackendReady(TARGETS.inventory, tabs.inventory);
  statuses.selection = await waitForBackendReady(TARGETS.selection, tabs.selection);
  statuses.sif = await waitForBackendReady(TARGETS.sif, tabs.sif);

  const health = {
    adv: statuses.adv.status === 'ready' ? await checkAdHealth(tabs.adv) : { ok: false, skipped: statuses.adv.status },
    panel: tabs.panelDiagnostics?.health || await checkPanelHealth(tabs.panel),
    inventory: statuses.inventory.status === 'ready' ? await checkInventoryHealth(tabs.panel, tabs.inventory) : { ok: false, skipped: statuses.inventory.status },
    selection: statuses.selection.status === 'ready' ? await checkSelectionHealth(tabs.selection) : {
      ok: false,
      status: null,
      code: null,
      success: false,
      message: `selection page status: ${statuses.selection.status}`,
      resultKeys: [],
      hasAccessToken: false,
      tokenLength: 0,
    },
    sif: statuses.sif.status === 'ready' ? await checkSifHealth(tabs.sif) : {
      ok: false,
      status: null,
      code: null,
      message: `SIF page status: ${statuses.sif.status}`,
      hasToken: false,
      tokenLength: 0,
    },
  };

  const coreReady = allTargetsReady(statuses) && Object.keys(TARGETS).every(key => !!health[key]?.ok);
  const panelReady = !!health.panel?.ok;
  return {
    ok: coreReady && (!REQUIRE_PANEL || panelReady),
    requirePanel: REQUIRE_PANEL,
    panelWarning: coreReady && !panelReady ? 'project extension panel is unavailable; backend API reads are ready' : '',
    duplicateTabsClosed,
    panelDiagnostics: tabs.panelDiagnostics,
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
  checkPanelHealth,
  discoverPanelCandidateUrls,
  checkSifHealth,
  checkSelectionHealth,
  ensureBackendsReady,
  parseSelectionAccessToken,
  readPageState,
  waitForBackendReady,
};
