const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const {
  REMOVAL_INVENTORY_ADD_VIEW_ROUTE,
  parseRemovalInventoryAddViewInspection,
  redactUrl,
} = require('../../src/removal_inventory_fields');

const ROOT = path.join(__dirname, '..', '..');
const SNAPSHOT_DIR = path.join(ROOT, 'data', 'snapshots');

function formatYmd(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith('--')) continue;
    const eqIndex = item.indexOf('=');
    if (eqIndex >= 0) {
      options[item.slice(2, eqIndex)] = item.slice(eqIndex + 1);
      continue;
    }
    const key = item.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      options[key] = next;
      i += 1;
    } else {
      options[key] = '1';
    }
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));
const businessDate = String(options.date || options.businessDate || formatYmd(new Date())).slice(0, 10);
const sku = String(options.sku || '').trim();
const outputFile = options.out || path.join(
  SNAPSHOT_DIR,
  `removal_inventory_add_view_${sku || 'current'}_${businessDate}.json`
);

function listTabs() {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9222/json/list', res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', reject);
  });
}

async function findInventoryTab() {
  const tabs = await listTabs();
  const tab = tabs.find(item =>
    item.type === 'page' && String(item.url || '').includes('sellerinventory.yswg.com.cn')
  );
  if (!tab?.webSocketDebuggerUrl) {
    throw new Error('Cannot find sellerinventory tab on port 9222. Run npm run chrome:debug and log in first.');
  }
  return tab;
}

function createDevtoolsClient(ws) {
  let nextId = 1;
  return function send(method, params = {}, timeoutMs = 120000) {
    return new Promise((resolve, reject) => {
      const id = nextId;
      nextId += 1;
      const timer = setTimeout(() => {
        ws.off('message', handler);
        reject(new Error(`${method} timed out`));
      }, timeoutMs);
      const handler = data => {
        const response = JSON.parse(data);
        if (response.id !== id) return;
        clearTimeout(timer);
        ws.off('message', handler);
        if (response.error) return reject(new Error(JSON.stringify(response.error)));
        resolve(response.result);
      };
      ws.on('message', handler);
      ws.send(JSON.stringify({ id, method, params }));
    });
  };
}

function inspectionExpression(args) {
  function inspectRemovalAddView(runtimeArgs) {
    const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
    const redact = value => String(value || '').replace(/(Inventory-Token=)[^&#]+/ig, '$1<redacted>');
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

    function listFrameDoc() {
      const frame = [...document.querySelectorAll('iframe')]
        .find(item => String(item.src || '').includes('/pm/formal/list'));
      return frame?.contentDocument || null;
    }

    function findAddFrame(doc) {
      return [...doc.querySelectorAll('iframe')]
        .find(item => String(item.src || '').includes('internal_control_inventory_add_view'));
    }

    function findTargetButton(doc, targetSku) {
      const buttons = [...doc.querySelectorAll('.internal_control_inventory_add')];
      if (!targetSku) return buttons[0] || null;
      return buttons.find(button => (button.closest('tr')?.innerText || '').includes(targetSku)) || null;
    }

    async function searchSkuInList(doc, targetSku) {
      if (!targetSku) return { searched: false };
      const skuInput = doc.querySelector('textarea#sku, textarea[name="sku"], input#sku, input[name="sku"]');
      const queryButton = doc.querySelector('input.search_btn') ||
        [...doc.querySelectorAll('input,button,[role="button"],[onclick]')]
          .find(el => clean(el.value || el.innerText || el.textContent) === '查询');
      if (!skuInput || !queryButton) {
        return {
          searched: false,
          reason: 'sku_filter_or_query_button_missing',
          hasSkuInput: !!skuInput,
          hasQueryButton: !!queryButton,
        };
      }
      skuInput.value = targetSku;
      skuInput.dispatchEvent(new Event('input', { bubbles: true }));
      skuInput.dispatchEvent(new Event('change', { bubbles: true }));
      queryButton.click();
      for (let i = 0; i < 60; i += 1) {
        await sleep(500);
        const button = findTargetButton(doc, targetSku);
        if (button) return { searched: true, found: true };
        const rowText = clean(doc.querySelector('.layui-table-view, table, tbody')?.innerText || '');
        if (rowText.includes(targetSku)) return { searched: true, found: true, rowFoundWithoutButton: true };
      }
      return {
        searched: true,
        found: false,
        rowText: clean(doc.querySelector('.layui-table-view, table, tbody')?.innerText || '').slice(0, 800),
      };
    }

    function formItemsFromDoc(doc) {
      return [...doc.querySelectorAll('.layui-form-item,.layui-inline,.form-group,.el-form-item')]
        .map((element, index) => {
          const label = clean(element.querySelector('.layui-form-label,label,.el-form-item__label')?.innerText || '');
          const inputs = [...element.querySelectorAll('input,textarea,select')]
            .map(input => ({
              name: input.name || '',
              id: input.id || '',
              type: input.type || input.tagName.toLowerCase(),
              placeholder: input.placeholder || '',
              value: input.value || '',
              disabled: input.disabled === true,
              readonly: input.readOnly === true,
              options: input.tagName.toLowerCase() === 'select'
                ? [...input.options].map(option => clean(option.textContent || option.value)).filter(Boolean).slice(0, 30)
                : [],
            }))
            .filter(item => item.name || item.id || item.placeholder || item.value || item.options.length);
          const text = clean(element.innerText).slice(0, 260);
          return { index, label, text, inputs };
        })
        .filter(item => item.label || item.inputs.length || item.text);
    }

    function endpointHintsFromDoc(doc) {
      const scripts = [...doc.scripts].map(script => script.textContent || script.src || '').join('\n');
      return Array.from(new Set(
        [...scripts.matchAll(/\/(?:internalControl|pm)\/[A-Za-z0-9_?=&.\/-]+/g)].map(match => match[0])
      )).slice(0, 80);
    }

    return (async () => {
      const doc = listFrameDoc();
      if (!doc) return { ok: false, error: 'formal_list_frame_not_found' };
      let buttonMeta = {};
      if (runtimeArgs.sku) {
        let targetButton = findTargetButton(doc, runtimeArgs.sku);
        let searchMeta = {};
        if (!targetButton) {
          searchMeta = await searchSkuInList(doc, runtimeArgs.sku);
          targetButton = findTargetButton(doc, runtimeArgs.sku);
        }
        const targetRow = targetButton?.closest('tr');
        buttonMeta = {
          sku: runtimeArgs.sku,
          aid: targetButton?.getAttribute('data-aid') || '',
          rowText: clean(targetRow?.innerText || '').slice(0, 1200),
          searchMeta,
        };
      }
      let addFrame = findAddFrame(doc);
      if (runtimeArgs.sku) {
        const button = findTargetButton(doc, runtimeArgs.sku);
        if (!button) return {
          ok: false,
          error: 'removal_button_not_found_for_sku',
          sku: runtimeArgs.sku,
          searchMeta: buttonMeta.searchMeta || {},
        };
        button.click();
        for (let i = 0; i < 20; i += 1) {
          await sleep(500);
          addFrame = findAddFrame(doc);
          if (addFrame?.contentDocument && clean(addFrame.contentDocument.body?.innerText || '')) break;
        }
      } else if (!addFrame) {
        await sleep(1000);
        addFrame = findAddFrame(doc);
      }
      if (!addFrame?.contentDocument) {
        return {
          ok: false,
          error: 'removal_add_view_not_open',
          sku: runtimeArgs.sku || '',
          visibleFrames: [...doc.querySelectorAll('iframe')].map(frame => redact(frame.src || '')),
        };
      }
      const addDoc = addFrame.contentDocument;
      const sections = clean(addDoc.body?.innerText || '')
        .split(/\s+/)
        .filter(item => /分区$|地址信息|处理建议/.test(item))
        .slice(0, 40);
      return {
        ok: true,
        capturedAt: new Date().toISOString(),
        sku: buttonMeta.sku || runtimeArgs.sku || '',
        aid: buttonMeta.aid || '',
        parentRowText: buttonMeta.rowText || '',
        searchMeta: buttonMeta.searchMeta || {},
        url: redact(addDoc.location.href),
        title: addDoc.title || '',
        body: clean(addDoc.body?.innerText || '').slice(0, 4000),
        sections,
        formItems: formItemsFromDoc(addDoc),
        buttons: [...addDoc.querySelectorAll('button,input[type=button],input[type=submit],.layui-btn,.el-button')]
          .map((button, index) => ({
            index,
            text: clean(button.innerText || button.value || button.textContent),
            type: button.type || '',
            className: String(button.className || ''),
          }))
          .filter(button => button.text)
          .slice(0, 80),
        endpoints: endpointHintsFromDoc(addDoc),
      };
    })();
  }

  return `(${inspectRemovalAddView.toString()})(${JSON.stringify(args)})`;
}

async function fetchRemovalInventoryAddView() {
  const tab = await findInventoryTab();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise(resolve => ws.on('open', resolve));
  const send = createDevtoolsClient(ws);
  try {
    const result = await send('Runtime.evaluate', {
      expression: inspectionExpression({ sku }),
      awaitPromise: true,
      returnByValue: true,
    });
    const raw = result?.result?.value || {};
    if (!raw.ok) {
      throw new Error(JSON.stringify(raw));
    }
    const payload = parseRemovalInventoryAddViewInspection(raw);
    payload.businessDate = businessDate;
    payload.source = {
      system: 'sellerinventory',
      route: REMOVAL_INVENTORY_ADD_VIEW_ROUTE,
      tabUrl: redactUrl(tab.url || ''),
    };
    payload.parentRowText = raw.parentRowText || '';
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    fs.writeFileSync(outputFile, JSON.stringify(payload, null, 2), 'utf8');
    console.log(JSON.stringify({
      ok: true,
      outputFile,
      page: payload.page,
      sku: payload.sku,
      aid: payload.aid,
      writableFields: payload.writableFields.map(item => ({
        label: item.label,
        name: item.name,
        type: item.type,
        options: item.options,
      })),
      readOnlyValues: payload.readOnlyValues,
      actions: payload.actions,
      endpointHints: payload.endpointHints,
      warnings: payload.warnings,
      boundary: payload.boundary,
    }, null, 2));
  } finally {
    ws.close();
  }
}

if (require.main === module) {
  fetchRemovalInventoryAddView().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = {
  fetchRemovalInventoryAddView,
  parseArgs,
};
