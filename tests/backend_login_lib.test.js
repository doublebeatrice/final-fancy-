const assert = require('assert');
const {
  TARGETS,
  allTargetsReady,
  classifyBackendPage,
  parseSelectionAccessToken,
  redactSensitiveUrl,
} = require('../scripts/execute/backend_login_lib');

assert.strictEqual(
  redactSensitiveUrl('https://sellerinventory.yswg.com.cn/pm/formal/list?Inventory-Token=secret&tempid=123&jwt-token=abc&keep=1'),
  'https://sellerinventory.yswg.com.cn/pm/formal/list?Inventory-Token=%5Bredacted%5D&tempid=123&jwt-token=%5Bredacted%5D&keep=1'
);

assert.strictEqual(
  redactSensitiveUrl('https://selection.yswg.com.cn/soundasia_selection/sys/login?X-Access-Token=secret&keep=1'),
  'https://selection.yswg.com.cn/soundasia_selection/sys/login?X-Access-Token=%5Bredacted%5D&keep=1'
);

assert.strictEqual(
  classifyBackendPage(TARGETS.inventory, {
    href: 'https://sellerinventory.yswg.com.cn/login',
    text: 'SoundasiaAmazon login Log in and access in the browser',
    frames: ['https://login.work.weixin.qq.com/wwlogin/sso/login?redirect_uri=https%3A%2F%2Fsellerinventory.yswg.com.cn%2Fscanlogin'],
  }).status,
  'browser_login_available'
);

assert.strictEqual(
  classifyBackendPage(TARGETS.adv, {
    href: 'https://adv.yswg.com.cn/login',
    text: 'YSWG ad backend account password enterprise wecom',
    frames: [],
  }).status,
  'manual_login_required'
);

assert.strictEqual(
  classifyBackendPage(TARGETS.adv, {
    href: 'https://adv.yswg.com.cn/vue/?tabId=1',
    text: 'YSWG ad backend Huang HJ17 home',
    frames: [],
  }).status,
  'ready'
);

assert.strictEqual(
  classifyBackendPage(TARGETS.adv, {
    href: 'https://adv.yswg.com.cn/vue/WordDetector?tabId=1',
    title: '\u4e9a\u58f0\u5a01\u683c\u5e7f\u544a\u540e\u53f0\u7ba1\u7406\u7cfb\u7edf',
    text: '',
    frames: [],
  }).status,
  'ready'
);

assert.strictEqual(
  classifyBackendPage(TARGETS.inventory, {
    href: 'https://sellerinventory.yswg.com.cn/',
    text: 'Amazon product Huang bookmarks',
    frames: ['https://sellerinventory.yswg.com.cn/home'],
  }).status,
  'ready'
);

assert.strictEqual(
  classifyBackendPage(TARGETS.selection, {
    href: 'https://selection.yswg.com.cn/dashboard/analysis',
    text: '\u4e9a\u9a6c\u900a\u9009\u54c1 \u9009\u54c1\u7cfb\u7edf \u6b22\u8fce\u60a8\uff0c\u9ec4\u6210\u5586',
    frames: [],
  }).status,
  'ready'
);

assert.strictEqual(
  classifyBackendPage(TARGETS.selection, {
    href: 'https://selection.yswg.com.cn/user/login',
    text: '\u9009\u54c1\u7cfb\u7edf account password',
    frames: [],
  }).status,
  'manual_login_required'
);

assert.strictEqual(
  classifyBackendPage(TARGETS.selection, {
    href: 'https://selection.yswg.com.cn/user/login',
    text: '\u9009\u54c1\u7cfb\u7edf Log in and access in the browser',
    frames: ['https://login.work.weixin.qq.com/wwlogin/sso/login?redirect_uri=https%3A%2F%2Fselection.yswg.com.cn%2Fscanlogin'],
  }).status,
  'browser_login_available'
);

assert.strictEqual(
  classifyBackendPage(TARGETS.sif, {
    href: 'https://www.sif.com/',
    title: 'Sif\u5b98\u7f51',
    text: 'Sif \u5173\u952e\u8bcd \u6d41\u91cf \u5e7f\u544a',
    frames: [],
  }).status,
  'ready'
);

assert.strictEqual(
  parseSelectionAccessToken(JSON.stringify({ value: 'real-token', expire: 1770000000000 })),
  'real-token'
);

assert.strictEqual(
  parseSelectionAccessToken('not-json'),
  ''
);

assert.strictEqual(
  allTargetsReady({
    adv: { status: 'ready' },
    inventory: { status: 'ready' },
    selection: { status: 'ready' },
    sif: { status: 'ready' },
  }),
  true
);

assert.strictEqual(
  allTargetsReady({
    adv: { status: 'ready' },
    inventory: { status: 'manual_login_required' },
    selection: { status: 'ready' },
    sif: { status: 'ready' },
  }),
  false
);

assert.strictEqual(
  allTargetsReady({
    adv: { status: 'ready' },
    inventory: { status: 'ready' },
    selection: { status: 'ready' },
  }),
  false
);

console.log('backend_login_lib tests passed');
