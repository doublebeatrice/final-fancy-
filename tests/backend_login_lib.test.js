const assert = require('assert');
const {
  TARGETS,
  allTargetsReady,
  classifyBackendPage,
  redactSensitiveUrl,
} = require('../scripts/execute/backend_login_lib');

assert.strictEqual(
  redactSensitiveUrl('https://sellerinventory.yswg.com.cn/pm/formal/list?Inventory-Token=secret&tempid=123&jwt-token=abc&keep=1'),
  'https://sellerinventory.yswg.com.cn/pm/formal/list?Inventory-Token=%5Bredacted%5D&tempid=123&jwt-token=%5Bredacted%5D&keep=1'
);

assert.strictEqual(
  classifyBackendPage(TARGETS.inventory, {
    href: 'https://sellerinventory.yswg.com.cn/login',
    text: 'SoundasiaAmazon 登录 继续在浏览器中登录访问',
    frames: ['https://login.work.weixin.qq.com/wwlogin/sso/login?redirect_uri=https%3A%2F%2Fsellerinventory.yswg.com.cn%2Fscanlogin'],
  }).status,
  'browser_login_available'
);

assert.strictEqual(
  classifyBackendPage(TARGETS.adv, {
    href: 'https://adv.yswg.com.cn/login',
    text: '亚声威格广告管理系统 账号 密码 企业微信',
    frames: [],
  }).status,
  'manual_login_required'
);

assert.strictEqual(
  classifyBackendPage(TARGETS.adv, {
    href: 'https://adv.yswg.com.cn/vue/?tabId=1',
    text: 'YSWG 广告系统 黄成喆 HJ17 + 2 首页',
    frames: [],
  }).status,
  'ready'
);

assert.strictEqual(
  classifyBackendPage(TARGETS.inventory, {
    href: 'https://sellerinventory.yswg.com.cn/',
    text: '系统设置 产品 Amazon产品 黄成喆 书签',
    frames: ['https://sellerinventory.yswg.com.cn/home'],
  }).status,
  'ready'
);

assert.strictEqual(
  allTargetsReady({
    adv: { status: 'ready' },
    inventory: { status: 'ready' },
  }),
  true
);

assert.strictEqual(
  allTargetsReady({
    adv: { status: 'ready' },
    inventory: { status: 'manual_login_required' },
  }),
  false
);

console.log('backend_login_lib tests passed');
