const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const {
  buildActivityApplyUrl,
  injectCouponExpose,
  normalizeActivityPrefillPlan,
  redactActivityUrl,
} = require('../../src/activity_apply_prefill');

const ROOT = path.join(__dirname, '..', '..');
const DEFAULT_BROWSER_URL = process.env.DISCOVERY_BROWSER_URL || 'http://127.0.0.1:9222';

function text(value) {
  return String(value ?? '').trim();
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith('--')) continue;
    const key = item.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      options[key] = next;
      i += 1;
    } else {
      options[key] = '1';
    }
  }
  return {
    browserUrl: text(options['browser-url'] || DEFAULT_BROWSER_URL),
    schema: text(options.schema || ''),
    sku: text(options.sku || ''),
    site: text(options.site || ''),
    activityType: text(options.type || options.activityType || 'coupon'),
    startDate: text(options.start || options.startDate || ''),
    endDate: text(options.end || options.endDate || ''),
    discountType: text(options['discount-type'] || options.discountType || 'percent'),
    discountValue: text(options.discount || options.discountValue || ''),
    budget: text(options.budget || ''),
    keywords: text(options.keywords || ''),
    remark: text(options.remark || ''),
    activityKind: text(options.kind || options.activityKind || 'standard'),
    segment: text(options.segment || options.targetedSegment || 'all'),
    exchangeOnce: options['exchange-once'] || options.exchangeOnce,
    multiActivity: options['multi-activity'] || options.multiActivity,
    investmentDiscount: text(options['investment-discount'] || options.investmentDiscount || ''),
    replace: options.replace !== '0',
  };
}

function planFromOptions(options = {}) {
  const filePlan = options.schema ? readJson(path.resolve(options.schema)) : {};
  const cliPlan = {
    activityType: options.activityType,
    sku: options.sku,
    site: options.site,
    startDate: options.startDate,
    endDate: options.endDate,
    discountType: options.discountType,
    discountValue: options.discountValue,
    budget: options.budget,
    keywords: options.keywords,
    remark: options.remark,
    activityKind: options.activityKind,
    segment: options.segment,
    exchangeOnce: options.exchangeOnce,
    multiActivity: options.multiActivity,
    investmentDiscount: options.investmentDiscount,
  };
  const merged = { ...filePlan };
  for (const [key, value] of Object.entries(cliPlan)) {
    if (value !== undefined && value !== null && String(value).trim() !== '') merged[key] = value;
  }
  return normalizeActivityPrefillPlan(merged);
}

function requestJson(url, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: timeoutMs }, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body || 'null'));
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error(`timeout requesting ${url}`)));
    req.on('error', reject);
  });
}

function browserBaseUrl(browserUrl) {
  return browserUrl.replace(/\/$/, '');
}

async function listTabs(browserUrl) {
  return requestJson(`${browserBaseUrl(browserUrl)}/json/list`);
}

async function findSellerInventoryRootTab(browserUrl) {
  const tabs = await listTabs(browserUrl);
  const root = tabs.find(tab => tab.url === 'https://sellerinventory.yswg.com.cn/');
  if (root?.webSocketDebuggerUrl) return root;
  const fallback = tabs.find(tab => String(tab.url || '').startsWith('https://sellerinventory.yswg.com.cn/'));
  if (fallback?.webSocketDebuggerUrl) return fallback;
  throw new Error('Cannot find sellerinventory tab on Chrome debug port. Run npm run chrome:operator first.');
}

class CdpClient {
  constructor(tab) {
    this.ws = new WebSocket(tab.webSocketDebuggerUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.handlers = [];
    this.ws.on('message', data => this.onMessage(data));
  }

  ready(timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout opening CDP websocket')), timeoutMs);
      this.ws.once('open', () => {
        clearTimeout(timer);
        resolve();
      });
      this.ws.once('error', error => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  onMessage(data) {
    const msg = JSON.parse(data);
    if (msg.id && this.pending.has(msg.id)) {
      const item = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      clearTimeout(item.timer);
      if (msg.error) item.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
      else item.resolve(msg.result || {});
      return;
    }
    if (msg.method) {
      for (const handler of this.handlers) handler(msg).catch(() => {});
    }
  }

  send(method, params = {}, timeoutMs = 30000) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`timeout sending ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ id, method, params }), error => {
        if (!error) return;
        this.pending.delete(id);
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  addHandler(handler) {
    this.handlers.push(handler);
  }

  close() {
    for (const item of this.pending.values()) {
      clearTimeout(item.timer);
      item.reject(new Error('CDP websocket closed'));
    }
    this.pending.clear();
    try { this.ws.close(); } catch (_) {}
  }
}

async function evaluate(client, expression, timeoutMs = 60000) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  }, timeoutMs);
  if (result.exceptionDetails) {
    const detail = result.exceptionDetails;
    throw new Error(detail.exception?.description || detail.text || 'Runtime.evaluate failed');
  }
  return result.result?.value;
}

function responseHeaders(headers = []) {
  return (headers || [])
    .filter(header => !/^content-length$/i.test(header.name || ''))
    .map(header => ({ name: header.name, value: header.value }));
}

function textFromBody(result) {
  if (!result.base64Encoded) return result.body || '';
  return Buffer.from(result.body || '', 'base64').toString('utf8');
}

function base64(value) {
  return Buffer.from(String(value || ''), 'utf8').toString('base64');
}

async function installCouponInterception(client, patchId) {
  client.addHandler(async msg => {
    if (msg.method !== 'Fetch.requestPaused') return;
    const event = msg.params;
    const url = event.request?.url || '';
    const requestId = event.requestId;
    if (!event.responseStatusCode) {
      await client.send('Fetch.continueRequest', { requestId });
      return;
    }

    if (url.includes('/report/activityApplyIndex')) {
      const body = textFromBody(await client.send('Fetch.getResponseBody', { requestId }, 60000));
      const patched = body.replace(
        /applyCoupon\.js\?v=([0-9]+)/g,
        `applyCoupon.js?v=$1&codexPrefill=${patchId}`,
      );
      await client.send('Fetch.fulfillRequest', {
        requestId,
        responseCode: event.responseStatusCode || 200,
        responseHeaders: responseHeaders(event.responseHeaders),
        body: base64(patched),
      }, 60000);
      return;
    }

    if (url.includes('/vue/page/marketing/activity/applyCoupon.js')) {
      const body = textFromBody(await client.send('Fetch.getResponseBody', { requestId }, 60000));
      const patched = injectCouponExpose(body);
      const headers = responseHeaders(event.responseHeaders);
      if (!headers.some(header => /^content-type$/i.test(header.name))) {
        headers.push({ name: 'content-type', value: 'application/javascript; charset=utf-8' });
      }
      await client.send('Fetch.fulfillRequest', {
        requestId,
        responseCode: event.responseStatusCode || 200,
        responseHeaders: headers,
        body: base64(patched),
      }, 60000);
      return;
    }

    await client.send('Fetch.continueRequest', { requestId });
  });

  await client.send('Fetch.enable', {
    patterns: [
      { urlPattern: '*sellerinventory.yswg.com.cn/report/activityApplyIndex*', requestStage: 'Response' },
      { urlPattern: '*sellerinventory.yswg.com.cn/vue/page/marketing/activity/applyCoupon.js*', requestStage: 'Response' },
    ],
  });
}

function browserFetchInventoryRowSource() {
  return async function fetchInventoryRow(args) {
    const sku = String(args.sku || '').trim();
    const site = String(args.site || '').trim();
    if (!sku) return JSON.stringify({ ok: false, error: 'sku_required' });
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    const getRows = json => {
      if (Array.isArray(json?.data)) return json.data;
      if (Array.isArray(json?.data?.list)) return json.data.list;
      if (Array.isArray(json?.data?.rows)) return json.data.rows;
      if (Array.isArray(json?.data?.data)) return json.data.data;
      if (Array.isArray(json?.rows)) return json.rows;
      if (Array.isArray(json?.list)) return json.list;
      return [];
    };
    const findFrame = () => [...document.querySelectorAll('iframe')]
      .find(frame => (frame.src || '').includes('/pm/formal/list') && !(frame.src || '').includes('variant_sku'));
    let frame = findFrame();
    if (!frame && window.layui?.index?.openTabsPage) {
      window.layui.index.openTabsPage('/pm/formal/list', '产品数据分析-开发');
      for (let i = 0; i < 40 && !frame; i += 1) {
        await sleep(250);
        frame = findFrame();
      }
    }
    if (!frame?.contentWindow || !frame.contentDocument) {
      return JSON.stringify({ ok: false, error: 'formal_list_frame_not_found' });
    }

    const win = frame.contentWindow;
    const doc = frame.contentDocument;
    let captured = null;
    const proto = win.XMLHttpRequest.prototype;
    const originalOpen = proto.open;
    const originalSend = proto.send;
    const originalSetHeader = proto.setRequestHeader;
    proto.open = function open(method, url, ...rest) {
      this.__codexActivityMethod = method;
      this.__codexActivityUrl = url;
      this.__codexActivityHeaders = {};
      return originalOpen.call(this, method, url, ...rest);
    };
    proto.setRequestHeader = function setHeader(key, value) {
      this.__codexActivityHeaders = this.__codexActivityHeaders || {};
      this.__codexActivityHeaders[key] = value;
      return originalSetHeader.call(this, key, value);
    };
    proto.send = function send(body) {
      if (String(this.__codexActivityUrl || '').includes('/pm/formal/list')) {
        captured = {
          url: new URL(this.__codexActivityUrl, win.location.href).toString(),
          method: this.__codexActivityMethod || 'POST',
          headers: this.__codexActivityHeaders || {},
          body: String(body || ''),
        };
      }
      return originalSend.call(this, body);
    };
    try {
      const queryButton = doc.querySelector('input.search_btn') ||
        [...doc.querySelectorAll('input,button,[role="button"]')]
          .find(el => (el.value || el.innerText || el.textContent || '').replace(/\s+/g, '') === '查询');
      if (!queryButton) return JSON.stringify({ ok: false, error: 'query_button_not_found' });
      queryButton.click();
      for (let i = 0; i < 60 && !captured; i += 1) await sleep(150);
    } finally {
      proto.open = originalOpen;
      proto.send = originalSend;
      proto.setRequestHeader = originalSetHeader;
    }
    if (!captured?.body) return JSON.stringify({ ok: false, error: 'formal_list_request_not_captured' });

    const params = new URLSearchParams(captured.body);
    const keep = new Set(['_token']);
    for (const key of [...params.keys()]) {
      if (!keep.has(key)) params.set(key, '');
    }
    params.set('page', '1');
    params.set('limit', '20');
    params.set('sku', sku);
    if (site) params.set('salesChannel', `"${site}"`);
    const res = await win.fetch(captured.url, {
      method: captured.method || 'POST',
      credentials: 'include',
      headers: captured.headers || {},
      body: params.toString(),
      referrer: frame.src || win.location.href,
    });
    const bodyText = await res.text();
    let json = null;
    try { json = JSON.parse(bodyText || '{}'); } catch (error) {
      return JSON.stringify({ ok: false, error: 'formal_list_json_parse_failed', status: res.status, sample: bodyText.slice(0, 300) });
    }
    const rows = getRows(json);
    const row = rows.find(item => String(item.sku || '').trim().toUpperCase() === sku.toUpperCase()) || rows[0];
    if (!row) return JSON.stringify({ ok: false, error: 'sku_not_found', rowCount: rows.length });
    return JSON.stringify({ ok: true, row });
  };
}

function browserOpenActivityFormSource() {
  return async function openActivityForm(args) {
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    if (args.replace !== false) {
      for (const frame of [...document.querySelectorAll('iframe')]) {
        if (!(frame.src || '').includes('/report/activityApplyIndex')) continue;
        try {
          const index = window.layer.getFrameIndex(frame.name);
          if (index !== undefined) window.layer.close(index);
        } catch (_) {}
      }
      await sleep(300);
    }
    window.layer.open({
      type: 2,
      title: `${args.sku}活动提报申请`,
      area: ['1300px', '700px'],
      content: args.url,
      maxmin: true,
    });
    return JSON.stringify({ ok: true });
  };
}

function browserApplyCouponPatchSource() {
  return async function applyCouponPatch(args) {
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    const sku = String(args.sku || '').trim();
    const patch = args.patch || {};
    const findFrame = () => [...document.querySelectorAll('iframe')].reverse()
      .find(frame => (frame.src || '').includes('/report/activityApplyIndex') && (!sku || (frame.src || '').includes(`skus=${encodeURIComponent(sku)}`)));

    let frame = null;
    let control = null;
    for (let i = 0; i < 80; i += 1) {
      frame = findFrame();
      control = frame?.contentWindow?.__codexActivityForms?.coupon;
      if (control?.form?.value) break;
      await sleep(250);
    }
    if (!control?.form?.value) {
      return JSON.stringify({ ok: false, error: 'coupon_form_control_not_exposed' });
    }

    for (let i = 0; i < 30 && !control.form.value.set_name; i += 1) {
      await sleep(250);
    }

    Object.assign(control.form.value, patch);
    if (Array.isArray(patch.variationSkus) && patch.variationSkus.length && control.isVariation) {
      control.isVariation.value = '1';
    } else if (control.isVariation) {
      control.isVariation.value = '2';
    }
    if (typeof control.onChangeCascader === 'function' && Array.isArray(control.form.value.cascaderValue)) {
      control.onChangeCascader(control.form.value.cascaderValue);
    }
    if (typeof control.onChangeCouponValue === 'function' && control.form.value.couponValue !== undefined) {
      control.onChangeCouponValue(control.form.value.couponValue);
    }
    if (typeof control.onChangeKeywords === 'function' && control.form.value.core_keywords) {
      control.onChangeKeywords(control.form.value.core_keywords);
    }
    if (frame.contentWindow?.Vue?.nextTick) await frame.contentWindow.Vue.nextTick();
    await sleep(500);

    const snapshot = control.getSnapshot ? control.getSnapshot() : JSON.parse(JSON.stringify(control.form.value || {}));
    return JSON.stringify({
      ok: true,
      frameSrc: frame.src,
      snapshot,
      setNameReady: !!snapshot.set_name,
      note: 'form_prefilled_submit_not_clicked',
    });
  };
}

async function run(options = parseArgs()) {
  const plan = planFromOptions(options);
  const tab = await findSellerInventoryRootTab(options.browserUrl);
  const client = new CdpClient(tab);
  await client.ready();
  const patchId = Date.now();
  try {
    await client.send('Runtime.enable');
    await installCouponInterception(client, patchId);

    const rowRaw = await evaluate(
      client,
      `(${browserFetchInventoryRowSource()})(${JSON.stringify({ sku: plan.sku, site: plan.site || '' })})`,
      90000,
    );
    const rowResult = JSON.parse(rowRaw || '{}');
    if (!rowResult.ok) throw new Error(`inventory row lookup failed: ${JSON.stringify(rowResult)}`);

    const activityUrl = buildActivityApplyUrl(rowResult.row, plan);
    await evaluate(
      client,
      `(${browserOpenActivityFormSource()})(${JSON.stringify({ url: activityUrl, sku: plan.sku, replace: options.replace })})`,
      30000,
    );
    const fillRaw = await evaluate(
      client,
      `(${browserApplyCouponPatchSource()})(${JSON.stringify({ sku: plan.sku, patch: plan.formPatch })})`,
      60000,
    );
    const fillResult = JSON.parse(fillRaw || '{}');
    if (!fillResult.ok) throw new Error(`coupon prefill failed: ${JSON.stringify(fillResult)}`);
    return {
      ok: true,
      mode: 'prefill-only',
      activityType: plan.activityType,
      sku: plan.sku,
      row: {
        sku: rowResult.row.sku,
        site: rowResult.row.salesChannel,
        account: rowResult.row.account,
        asin: rowResult.row.asin,
        price: rowResult.row.lowestprice,
      },
      activityUrl: redactActivityUrl(activityUrl),
      setNameReady: fillResult.setNameReady,
      snapshot: fillResult.snapshot,
      note: fillResult.note,
    };
  } finally {
    try { await client.send('Fetch.disable', {}, 5000); } catch (_) {}
    client.close();
  }
}

if (require.main === module) {
  run().then(result => {
    console.log(JSON.stringify(result, null, 2));
  }).catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = {
  browserApplyCouponPatchSource,
  browserFetchInventoryRowSource,
  browserOpenActivityFormSource,
  installCouponInterception,
  parseArgs,
  planFromOptions,
  run,
};
