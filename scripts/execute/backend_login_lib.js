const TARGETS = {
  adv: {
    key: 'adv',
    label: 'ad backend',
    requiredUrl: 'https://adv.yswg.com.cn/',
    origin: 'https://adv.yswg.com.cn',
    loginPath: '/login',
    readyHints: ['YSWG', 'HJ17', 'HJ171', 'HJ172'],
  },
  inventory: {
    key: 'inventory',
    label: 'inventory backend',
    requiredUrl: 'https://sellerinventory.yswg.com.cn/',
    origin: 'https://sellerinventory.yswg.com.cn',
    loginPath: '/login',
    readyHints: ['Amazon', 'Huang', 'HJ17'],
  },
};

const SENSITIVE_QUERY_KEYS = new Set([
  'Inventory-Token',
  'jwt-token',
  'token',
  '_token',
  'x-xsrf-token',
  'csrf',
  'XSRF-TOKEN',
]);

function redactSensitiveUrl(value) {
  const text = String(value || '');
  if (!text) return '';
  try {
    const url = new URL(text);
    for (const key of [...url.searchParams.keys()]) {
      if (SENSITIVE_QUERY_KEYS.has(key)) url.searchParams.set(key, '[redacted]');
    }
    return url.toString();
  } catch (_) {
    return text
      .replace(/([?&](?:Inventory-Token|jwt-token|token|_token|x-xsrf-token|csrf|XSRF-TOKEN)=)[^&\s]+/gi, '$1[redacted]')
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

function hasBrowserLoginText(text) {
  return /继续在浏览器中登录访问|Log in and access in the browser|browser/i.test(text);
}

function classifyBackendPage(target, pageState = {}) {
  if (!pageState || !pageState.href) {
    return { status: 'missing', reason: 'tab_not_found' };
  }

  const text = normalizeText(pageState.text);
  const href = String(pageState.href || '');
  const onLoginPage = isLoginHref(target, href);
  const hasWeCom = hasWeComLoginFrame(pageState);
  const readyByUrl = href.startsWith(target.origin) && !onLoginPage;
  const readyByText = target.key === 'adv'
    ? text.includes('YSWG') && (text.includes('HJ17') || text.includes('Huang') || text.includes('黄'))
    : (text.includes('Amazon') || text.includes('产品')) && (text.includes('黄') || text.includes('Huang') || text.includes('书签'));

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

function allTargetsReady(statusByKey) {
  return ['adv', 'inventory'].every(key => statusByKey?.[key]?.status === 'ready');
}

module.exports = {
  TARGETS,
  allTargetsReady,
  classifyBackendPage,
  hasWeComLoginFrame,
  redactSensitiveUrl,
};
