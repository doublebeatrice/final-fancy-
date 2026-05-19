const TARGETS = {
  adv: {
    key: 'adv',
    label: 'ad backend',
    requiredUrl: 'https://adv.yswg.com.cn/',
    origin: 'https://adv.yswg.com.cn',
    loginPath: '/login',
    readyHints: ['YSWG', 'HJ17', 'HJ171', 'HJ172', 'Huang'],
  },
  inventory: {
    key: 'inventory',
    label: 'inventory backend',
    requiredUrl: 'https://sellerinventory.yswg.com.cn/',
    origin: 'https://sellerinventory.yswg.com.cn',
    loginPath: '/login',
    readyHints: ['Amazon', 'Huang', 'HJ17', '\u4ea7\u54c1'],
  },
  selection: {
    key: 'selection',
    label: 'selection backend',
    requiredUrl: 'https://selection.yswg.com.cn/dashboard/analysis',
    origin: 'https://selection.yswg.com.cn',
    loginPath: '/user/login',
    readyHints: ['\u9009\u54c1\u7cfb\u7edf', '\u4e9a\u9a6c\u900a\u9009\u54c1', '\u6b22\u8fce\u60a8'],
  },
};

const SENSITIVE_QUERY_KEYS = new Set([
  'inventory-token',
  'jwt-token',
  'token',
  '_token',
  'x-access-token',
  'x-xsrf-token',
  'csrf',
  'xsrf-token',
]);

function redactSensitiveUrl(value) {
  const text = String(value || '');
  if (!text) return '';
  try {
    const url = new URL(text);
    for (const key of [...url.searchParams.keys()]) {
      if (SENSITIVE_QUERY_KEYS.has(String(key).toLowerCase())) {
        url.searchParams.set(key, '[redacted]');
      }
    }
    return url.toString();
  } catch (_) {
    return text
      .replace(/([?&](?:Inventory-Token|jwt-token|token|_token|X-Access-Token|x-xsrf-token|csrf|XSRF-TOKEN)=)[^&\s]+/gi, '$1[redacted]')
      .slice(0, 500);
  }
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function isLoginHref(target, href) {
  try {
    const url = new URL(String(href || ''), target.origin);
    return url.origin === target.origin && url.pathname === target.loginPath;
  } catch (_) {
    return String(href || '').includes(target.loginPath);
  }
}

function hasWeComLoginFrame(pageState = {}) {
  return (pageState.frames || []).some(src => String(src || '').includes('login.work.weixin.qq.com'));
}

function hasAnyHint(text, hints = []) {
  return hints.some(hint => text.includes(hint));
}

function isReadyByText(target, text) {
  if (target.key === 'adv') {
    return (text.includes('YSWG') && hasAnyHint(text, ['HJ17', 'HJ171', 'HJ172', 'Huang'])) ||
      text.includes('\u4e9a\u58f0\u5a01\u683c\u5e7f\u544a\u540e\u53f0\u7ba1\u7406\u7cfb\u7edf');
  }
  if (target.key === 'inventory') {
    return hasAnyHint(text, ['Amazon', '\u4ea7\u54c1']) && hasAnyHint(text, ['Huang', 'HJ17', '\u4e66\u7b7e']);
  }
  if (target.key === 'selection') {
    return hasAnyHint(text, target.readyHints);
  }
  return hasAnyHint(text, target.readyHints);
}

function classifyBackendPage(target, pageState = {}) {
  if (!pageState || !pageState.href) {
    return { status: 'missing', reason: 'tab_not_found' };
  }

  const text = normalizeText(`${pageState.title || ''} ${pageState.text || ''}`);
  const href = String(pageState.href || '');
  const onLoginPage = isLoginHref(target, href);
  const hasWeCom = hasWeComLoginFrame(pageState);
  const readyByUrl = href.startsWith(target.origin) && !onLoginPage;
  const readyByText = isReadyByText(target, text);

  if (readyByUrl && readyByText) {
    return { status: 'ready', reason: 'logged_in_app_visible' };
  }

  if (onLoginPage && hasWeCom) {
    return { status: 'browser_login_available', reason: 'wecom_browser_access_visible' };
  }

  if (onLoginPage) {
    return { status: 'manual_login_required', reason: 'login_page_without_wecom_browser_access' };
  }

  return { status: 'unknown', reason: 'unrecognized_backend_state' };
}

function parseSelectionAccessToken(rawValue) {
  if (!rawValue) return '';
  try {
    const parsed = JSON.parse(String(rawValue));
    return typeof parsed?.value === 'string' ? parsed.value : '';
  } catch (_) {
    return '';
  }
}

function allTargetsReady(statusByKey) {
  return Object.keys(TARGETS).every(key => statusByKey?.[key]?.status === 'ready');
}

module.exports = {
  TARGETS,
  allTargetsReady,
  classifyBackendPage,
  hasWeComLoginFrame,
  parseSelectionAccessToken,
  redactSensitiveUrl,
};
